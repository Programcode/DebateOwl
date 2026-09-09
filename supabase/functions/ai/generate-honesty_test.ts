const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  EXA_API_KEY: "test-exa-key",
  OPENAI_API_KEY: "test-openai-key",
};

for (const [key, value] of Object.entries(environment)) {
  Deno.env.set(key, value);
}

const { handleRequest } = await import("./index.ts");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const generatedOutput = {
  exordio: { hook: "Hook", transition: "Transition" },
  caseStructure: {
    thesis: "Thesis",
    framework: "Pragmatic",
    keyDefinitions: [],
    burdenOfProof: "Burden",
  },
  contentions: [1, 2, 3].map((id) => ({
    id: String(id),
    claim: `Claim ${id}`,
    reasoning: "Reasoning",
    evidence: "",
    needsSource: false,
    sourceQuery: "",
    impact: "Impact",
  })),
  predictedOpponentCase: {
    likelyArguments: ["Argument"],
    strategicWeaknesses: ["Weakness"],
    keyClashes: ["Clash"],
  },
  counters: [{
    targetArgument: "Argument",
    counterpoint: "Response",
    rebuttal: "Rebuttal",
  }],
  metadata: {
    side: "pro",
    format: "custom",
    generatedAt: "CURRENT_ISO_TIMESTAMP",
  },
};

Deno.test("generate marks every contention when research has no citable sources", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;

  globalThis.fetch =
    (async (input: Request | URL | string, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.origin === "https://supabase.test") {
        if (url.pathname === "/auth/v1/user") {
          return jsonResponse({ id: "user-1", aud: "authenticated" });
        }
        if (url.pathname.includes("/rest/v1/user_roles")) {
          return jsonResponse({ role: "user" });
        }
        if (url.pathname.includes("/rest/v1/user_settings")) {
          return jsonResponse({
            subscription_tier: "trial",
            daily_limit_override: 50,
            trial_ends_at: "2099-01-01T00:00:00.000Z",
            grace_period_ends_at: null,
          });
        }
        if (url.pathname.includes("/rest/v1/rate_limits")) {
          return jsonResponse({ limit_value: 50 });
        }
        if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
          return jsonResponse([{ allowed: true, current_count: 1 }]);
        }
        if (url.pathname.includes("/rest/v1/global_prompts")) {
          return jsonResponse({ prompt_text: null });
        }
        if (url.pathname.includes("/rest/v1/ai_requests")) {
          return new Response(null, { status: 201 });
        }
        throw new Error(`Unhandled Supabase request: ${url}`);
      }

      if (url.href === "https://api.exa.ai/search") {
        return jsonResponse({ results: [] });
      }

      if (url.href === "https://api.openai.com/v1/chat/completions") {
        providerCalls += 1;
        const content = providerCalls === 1 ? { queries: [] } : generatedOutput;
        const requestBody = init?.body
          ? JSON.parse(String(init.body)) as Record<string, unknown>
          : {};
        if (
          providerCalls === 1 &&
          !JSON.stringify(requestBody.messages).includes("follow-up")
        ) {
          throw new Error("unexpected provider request order");
        }
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(content) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    }) as typeof fetch;

  try {
    const response = await handleRequest(
      new Request("http://127.0.0.1/functions/v1/ai", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-user-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feature: "generate",
          model: "gpt-5.4-mini",
          input: {
            motion: "Should schools teach media literacy?",
            side: "pro",
            format: "custom",
            role: "intro",
            length: "standard",
          },
        }),
      }),
    );
    if (response.status !== 200) {
      throw new Error(
        `generate handler returned ${response.status}: ${await response
          .text()}`,
      );
    }

    const body = await response.json() as {
      output?: { contentions?: Array<{ needsSource?: boolean }> };
    };
    const contentions = body.output?.contentions ?? [];
    if (
      contentions.length !== 3 ||
      contentions.some((contention) => contention.needsSource !== true)
    ) {
      throw new Error(
        `missing-source honesty was not enforced: ${
          JSON.stringify(contentions)
        }`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
