function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  EXA_API_KEY: "test-exa-key",
  OPENAI_API_KEY: "test-openai-key",
};

for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

Deno.test("factoids handler carries Exa filters and consulted-source metadata across the request boundary", async () => {
  const originalFetch = globalThis.fetch;
  const exaSearchBodies: Array<Record<string, unknown>> = [];
  let providerCalls = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, handleRequest);
  const serverAddress = server.addr as Deno.NetAddr;

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.hostname === "127.0.0.1" && url.port === String(serverAddress.port)) {
      return originalFetch(input, init);
    }

    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return jsonResponse({ id: "user-1", aud: "authenticated" });
      if (url.pathname.includes("/rest/v1/user_roles")) return jsonResponse({ role: "user" });
      if (url.pathname.includes("/rest/v1/user_settings")) {
        return jsonResponse({
          subscription_tier: "trial",
          daily_limit_override: 50,
          trial_ends_at: "2099-01-01T00:00:00.000Z",
          grace_period_ends_at: null,
        });
      }
      if (url.pathname.includes("/rest/v1/rate_limits")) return jsonResponse({ limit_value: 50 });
      if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
        return jsonResponse([{ allowed: true, current_count: 1 }]);
      }
      if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
      throw new Error(`Unhandled Supabase request: ${url}`);
    }

    if (url.href === "https://api.exa.ai/search") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      exaSearchBodies.push(body);
      return jsonResponse({
        results: [{
          title: "Official energy statistics",
          url: "https://energy.gov/reports/solar-costs-2024",
          text: "Official government statistics report showing a 42 percent cost reduction in solar energy.",
          publishedDate: "2024-06-01T00:00:00.000Z",
        }],
      });
    }

    if (url.href === "https://api.exa.ai/contents") {
      return jsonResponse({
        results: [{
          url: "https://energy.gov/reports/solar-costs-2024",
          text: "Official government statistics report showing a 42 percent cost reduction in solar energy.",
        }],
      });
    }

    if (url.href === "https://api.openai.com/v1/chat/completions") {
      providerCalls += 1;
      const content = providerCalls === 1
        ? { queries: [] }
        : {
          factoids: [{
            id: "fact-1",
            shortClaim: "Solar costs fell by 42 percent",
            keyFigure: "42%",
            context: "The official report compares the relevant period.",
            limitations: "The result depends on the measured market segment.",
            citation: {
              title: "Official energy statistics",
              publisher: "Department of Energy",
              date: "2024",
              url: "https://energy.gov/reports/solar-costs-2024",
              verified: "pending",
            },
            howToUse: "Use this as a bounded cost trend.",
            relevanceScore: 92,
          }],
          searchSuggestions: [],
          warnings: [],
          verificationStatus: "pending",
        };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    }

    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await originalFetch(`http://127.0.0.1:${serverAddress.port}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
      },
      body: JSON.stringify({
        feature: "factoids",
        model: "gpt-5.4-mini",
        input: {
          claim: "solar energy costs",
          direction: "for",
          region: "United States",
          sourceType: "government",
          timeframe: "2024-2026",
          sourceCount: 5,
        },
      }),
    });

    if (response.status !== 200) throw new Error(`handler returned ${response.status}: ${await response.text()}`);
    const payload = await response.json() as {
      output?: { factoids?: Array<{ citation?: { verified?: string } }> };
      discoveredSources?: Array<{ url?: string; qualityLabel?: string; sourceType?: string; query?: string }>;
    };
    if (payload.output?.factoids?.[0]?.citation?.verified !== "verified") {
      throw new Error("handler did not verify a fetched non-weak citation");
    }
    const source = payload.discoveredSources?.[0];
    if (source?.qualityLabel !== "strong" || source.sourceType !== "government" || !source.query) {
      throw new Error(`consulted-source provenance missing: ${JSON.stringify(source)}`);
    }
    if (exaSearchBodies.length === 0) throw new Error("handler never called Exa search");
    for (const body of exaSearchBodies) {
      const query = typeof body.query === "string" ? body.query : "";
      if (query.includes("site:")) throw new Error(`site operator leaked into Exa query: ${query}`);
      if (!Array.isArray(body.includeDomains) || !body.includeDomains.includes("energy.gov")) {
        throw new Error(`government includeDomains missing: ${JSON.stringify(body)}`);
      }
      if (body.startPublishedDate !== "2024-01-01T00:00:00.000Z") {
        throw new Error(`published-date filter missing: ${JSON.stringify(body)}`);
      }
      if (body.endPublishedDate !== "2026-12-31T23:59:59.999Z") {
        throw new Error(`published-date upper bound missing: ${JSON.stringify(body)}`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
  }
});
