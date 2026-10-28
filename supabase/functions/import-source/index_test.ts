const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

for (const [key, value] of Object.entries(environment)) {
  Deno.env.set(key, value);
}

const { handleRequest, sourceTransport, limitImportedText } = await import("./index.ts");

// These tests stub the source with globalThis.fetch. Route the pinned transport
// there, recording the addresses each hop was allowed to dial.
const dialedAddresses: string[][] = [];
sourceTransport.get = (url, addresses, headers, signal) => {
  dialedAddresses.push(addresses);
  return fetch(url, { headers, signal, redirect: "manual" });
};

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

async function importWithStubs(
  upstream: () => Response,
  resolveDns: (host: string, type: string, call: number) => string[],
) {
  const originalFetch = globalThis.fetch;
  const originalResolveDns = Deno.resolveDns;
  const refunds: Record<string, unknown>[] = [];
  let upstreamCalls = 0;
  let dnsCalls = 0;
  Deno.resolveDns = ((host: string, type: string) => {
    if (type === "A") dnsCalls++;
    return Promise.resolve(resolveDns(host, type, dnsCalls));
  }) as typeof Deno.resolveDns;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://example.com") {
      upstreamCalls++;
      return upstream();
    }
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
      body: JSON.stringify({ url: "https://example.com/page" }),
    }));
    await response.body?.cancel();
    return { status: response.status, refunds, upstreamCalls };
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalResolveDns;
  }
}

const publicDns = (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : [];

Deno.test("import-source keeps the slot spent once the source was fetched", async () => {
  const cases: Array<[string, () => Response, number]> = [
    ["upstream error", () => new Response("nope", { status: 503 }), 502],
    ["unsupported type", () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }), 415],
    ["too short", () => new Response("<p>too short</p>", { headers: { "content-type": "text/html" } }), 422],
    ["network failure", () => {
      throw new TypeError("connection reset");
    }, 400],
  ];
  for (const [name, upstream, expected] of cases) {
    const result = await importWithStubs(upstream, publicDns);
    if (result.status !== expected) throw new Error(`${name} returned ${result.status}`);
    if (result.upstreamCalls !== 1) throw new Error(`${name} fetched ${result.upstreamCalls} times`);
    if (result.refunds.length !== 0) {
      throw new Error(`${name} refunded a fetched import: ${JSON.stringify(result.refunds)}`);
    }
  }
});

Deno.test("import-source refunds the slot when it fails before fetching the source", async () => {
  // The handler checks the host before reserving and again right before the
  // request. A host that turns private in between is refused without a fetch.
  const result = await importWithStubs(
    () => new Response("unreachable", { status: 200 }),
    (_host, type, call) => type === "A" ? [call === 1 ? "93.184.216.34" : "10.0.0.5"] : [],
  );
  if (result.status !== 400) throw new Error(`pre-fetch failure returned ${result.status}`);
  if (result.upstreamCalls !== 0) throw new Error("the source was fetched");
  if (
    result.refunds.length !== 1 || result.refunds[0]?.p_quota_key !== "import_source" ||
    result.refunds[0]?.p_units !== 1
  ) {
    throw new Error(`quota was not refunded: ${JSON.stringify(result.refunds)}`);
  }
});

Deno.test("import-source dials only the addresses the check just passed, on every redirect hop", async () => {
  dialedAddresses.length = 0;
  let hop = 0;
  const result = await importWithStubs(
    () => hop++ === 0
      ? new Response(null, { status: 302, headers: { location: "https://example.com/next" } })
      : new Response("<p>" + "word ".repeat(40) + "</p>", { headers: { "content-type": "text/html" } }),
    // Every lookup answers differently; each hop must use the answer it checked.
    (_host, type, call) => type === "A" ? [`93.184.216.${call}`] : [],
  );
  if (result.status !== 200) throw new Error(`import returned ${result.status}`);
  // Lookup 1 is the check before the quota; lookups 2 and 3 are the two hops.
  if (JSON.stringify(dialedAddresses) !== JSON.stringify([["93.184.216.2"], ["93.184.216.3"]])) {
    throw new Error(`dialed ${JSON.stringify(dialedAddresses)}`);
  }
});
