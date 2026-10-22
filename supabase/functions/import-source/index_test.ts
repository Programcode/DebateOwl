const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

for (const [key, value] of Object.entries(environment)) {
  Deno.env.set(key, value);
}

const { handleRequest, limitImportedText } = await import("./index.ts");

Deno.test("limitImportedText sets a truncated flag and keeps a note inside the cap", () => {
  const long = "word ".repeat(20_000);
  const limited = limitImportedText(long.trim(), 500);
  if (!limited.truncated) throw new Error("long text was not flagged as truncated");
  if (limited.content.length > 500) throw new Error(`capped text is ${limited.content.length} chars`);
  if (!limited.content.includes("[Truncated:")) throw new Error("truncation note missing");
  const short = limitImportedText("short text");
  if (short.truncated || short.content !== "short text") throw new Error("short text was truncated");
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

Deno.test("import-source reserves only import_source quota", async () => {
  const originalFetch = globalThis.fetch;
  const originalResolveDns = Deno.resolveDns;
  Deno.resolveDns = ((_host: string, type: string) => Promise.resolve(type === "A" ? ["93.184.216.34"] : [])) as typeof Deno.resolveDns;
  let quotaRequest: Record<string, unknown> | undefined;

  globalThis.fetch =
    (async (input: Request | URL | string, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.origin !== "https://supabase.test") {
        throw new Error(`Unexpected request: ${url}`);
      }
      if (url.pathname === "/auth/v1/user") {
        return jsonResponse({ id: "user-1", aud: "authenticated" });
      }
      if (url.pathname.includes("/rest/v1/user_roles")) {
        return jsonResponse({ role: "user" });
      }
      if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
        quotaRequest = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return jsonResponse([{ allowed: false, current_count: 50 }]);
      }
      throw new Error(`Unexpected Supabase request: ${url}`);
    }) as typeof fetch;

  try {
    const response = await handleRequest(
      new Request("http://127.0.0.1/functions/v1/import-source", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-user-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com/article" }),
      }),
    );

    if (response.status !== 429) {
      throw new Error(
        `import-source returned ${response.status}: ${await response.text()}`,
      );
    }
    if (quotaRequest?.p_quota_key !== "import_source") {
      throw new Error(
        `import-source reserved the wrong quota: ${
          JSON.stringify(quotaRequest)
        }`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalResolveDns;
  }
});

Deno.test("import-source rejects invalid bodies and private URLs without spending quota", async () => {
  const originalFetch = globalThis.fetch;
  const originalResolveDns = Deno.resolveDns;
  let quotaCalls = 0;
  Deno.resolveDns = ((_host: string, type: string) => Promise.resolve(type === "A" ? ["127.0.0.1"] : [])) as typeof Deno.resolveDns;
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/auth/v1/user") return jsonResponse({ id: "user-1", aud: "authenticated" });
    if (url.pathname.endsWith("/user_roles")) return jsonResponse({ role: "user" });
    if (url.pathname.endsWith("/ai_requests")) return new Response(null, { status: 201 });
    if (url.pathname.endsWith("/consume_daily_quota")) { quotaCalls++; return jsonResponse([{ allowed: false, current_count: 50 }]); }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    for (const body of ["{", "null", '{"url":{}}', '{"url":"file:///etc/passwd"}', '{"url":"http://127.0.0.1"}', '{"url":"https://private.example"}']) {
      const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/import-source", {
        method: "POST", headers: { Authorization: "Bearer test-token" }, body,
      }));
      if (response.status !== 400 || quotaCalls !== 0) throw new Error(`invalid import returned ${response.status}, reserved ${quotaCalls} quotas`);
    }
  } finally { globalThis.fetch = originalFetch; Deno.resolveDns = originalResolveDns; }
});

Deno.test("import-source refunds the slot when the upstream page fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalResolveDns = Deno.resolveDns;
  const refunds: Record<string, unknown>[] = [];
  Deno.resolveDns = ((_host: string, type: string) => Promise.resolve(type === "A" ? ["93.184.216.34"] : [])) as typeof Deno.resolveDns;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://example.com") return new Response("nope", { status: 503 });
    if (url.pathname === "/auth/v1/user") return jsonResponse({ id: "user-1", aud: "authenticated" });
    if (url.pathname.endsWith("/user_roles")) return jsonResponse({ role: "user" });
    if (url.pathname.endsWith("/ai_requests")) return new Response(null, { status: 201 });
    if (url.pathname.endsWith("/consume_daily_quota")) return jsonResponse([{ allowed: true, current_count: 1 }]);
    if (url.pathname.endsWith("/refund_daily_quota")) {
      refunds.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse(0);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/import-source", {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/missing" }),
    }));
    if (response.status !== 502) throw new Error(`upstream failure returned ${response.status}`);
    if (refunds.length !== 1 || refunds[0]?.p_quota_key !== "import_source" || refunds[0]?.p_units !== 1) {
      throw new Error(`quota was not refunded: ${JSON.stringify(refunds)}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalResolveDns;
  }
});
