function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

const demoCode = {
  id: "11111111-1111-4111-8111-111111111111",
  code_hash: "ignored-by-mock",
  label: "Tournament room",
  email: "demo@example.com",
  role: "user",
  expires_at: null,
  max_uses: 5,
  use_count: 0,
  disabled_at: null,
};

type Attempt = { ip_address: string | null; browser_fingerprint: string | null; failure_reason: string | null; success: boolean; created_at: string };
type Scenario = {
  attempts?: Attempt[];
  ipAddress?: string;
  browserFingerprint?: string;
  appMetadata?: Record<string, unknown>;
  attemptLookupFails?: boolean;
  currentRole?: string | null;
  existingUser?: boolean;
  redirectTo?: string;
  userMetadata?: Record<string, unknown>;
};

async function runScenario({
  attempts = [],
  ipAddress,
  browserFingerprint,
  appMetadata = {},
  attemptLookupFails = false,
  currentRole = "user",
  existingUser = true,
  redirectTo,
  userMetadata = {},
}: Scenario) {
  const calls: Array<{ body: Record<string, unknown> | null; method: string; pathname: string; search: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const bodyText = request.method === "GET" ? "" : await request.clone().text();
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : null;
    calls.push({ body, method: request.method, pathname: url.pathname, search: url.search });

    if (url.pathname === "/rest/v1/demo_access_attempts" && request.method !== "POST") {
      if (attemptLookupFails) return jsonResponse({ message: "attempt lookup failed" }, 500);
      const count = attempts.filter((attempt) => {
        for (const field of ["ip_address", "browser_fingerprint", "success", "created_at"] as const) {
          const filter = url.searchParams.get(field);
          if (!filter) continue;
          if (filter === "is.null" && attempt[field] !== null) return false;
          if (filter.startsWith("eq.") && String(attempt[field]) !== filter.slice(3)) return false;
          if (filter.startsWith("gte.") && String(attempt[field]) < filter.slice(4)) return false;
        }
        if (url.searchParams.get("or")?.includes("failure_reason.not.in") &&
          ["rate_limited", "invalid_format"].includes(attempt.failure_reason ?? "")) return false;
        return true;
      }).length;
      return new Response(null, { headers: { "Content-Range": `*/${count}` } });
    }
    if (url.pathname === "/rest/v1/demo_access_codes") return jsonResponse(demoCode);
    if (url.pathname === "/auth/v1/admin/users" && request.method === "GET") {
      return jsonResponse({
        users: existingUser
          ? [{
            id: "22222222-2222-4222-8222-222222222222",
            email: demoCode.email,
            app_metadata: appMetadata,
            user_metadata: userMetadata,
          }]
          : [],
      });
    }
    if (url.pathname === "/rest/v1/demo_access_attempts") return jsonResponse([], 201);
    if (url.pathname === "/rest/v1/user_roles" && request.method === "GET") {
      return jsonResponse(currentRole === null ? null : { role: currentRole });
    }
    if (url.pathname === "/rest/v1/rpc/consume_demo_access_code") return jsonResponse([{ reserved: true }]);
    if (url.pathname === "/auth/v1/admin/users" && request.method === "POST") {
      return jsonResponse({
        id: "33333333-3333-4333-8333-333333333333",
        email: demoCode.email,
        app_metadata: body?.app_metadata || {},
        user_metadata: body?.user_metadata || {},
      });
    }
    if (url.pathname === "/rest/v1/user_roles" || url.pathname === "/rest/v1/user_settings") {
      return jsonResponse([], 201);
    }
    if (url.pathname === "/auth/v1/admin/generate_link") {
      return jsonResponse({
        action_link: "https://supabase.test/verify",
        email_otp: "123456",
        hashed_token: "test-token-hash",
        redirect_to: "https://debate.pi-stack.org",
        verification_type: "magiclink",
        id: "33333333-3333-4333-8333-333333333333",
        email: demoCode.email,
      });
    }
    throw new Error(`Unhandled Supabase request: ${request.method} ${url}`);
  }) as typeof fetch;

  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/demo-code-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ipAddress ? { "X-Real-IP": ipAddress } : {}) },
      body: JSON.stringify({
        code: "DEMO-AB12-CD34",
        ...(browserFingerprint || attemptLookupFails ? { browserFingerprint: browserFingerprint ?? "test-browser" } : {}),
        ...(redirectTo ? { redirectTo } : {}),
      }),
    }));
    return { calls, response };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function countCalls(calls: Awaited<ReturnType<typeof runScenario>>["calls"], pathname: string) {
  return calls.filter((call) => call.pathname === pathname).length;
}

Deno.test("spoofed user_metadata cannot authorize demo-account reuse", async () => {
  const { calls, response } = await runScenario({
    userMetadata: { demo_access_code_id: demoCode.id },
  });

  if (response.status !== 409) throw new Error(`spoofed metadata returned ${response.status}`);
  if (countCalls(calls, "/rest/v1/rpc/consume_demo_access_code") !== 0) {
    throw new Error("spoofed metadata consumed a demo-code use");
  }
});

Deno.test("matching app_metadata permits demo-account reuse", async () => {
  const { calls, response } = await runScenario({
    appMetadata: { demo_access_code_id: demoCode.id },
  });

  if (response.status !== 200) throw new Error(`matching server binding returned ${response.status}`);
  if (countCalls(calls, "/rest/v1/rpc/consume_demo_access_code") !== 1) {
    throw new Error("matching server binding did not reserve one use");
  }
  if (countCalls(calls, "/auth/v1/admin/users") !== 1) {
    throw new Error("matching server binding created another Auth user");
  }
});

Deno.test("unrelated Auth account is rejected before code, role, or settings mutation", async () => {
  const { calls, response } = await runScenario({});

  if (response.status !== 409) throw new Error(`unrelated account returned ${response.status}`);
  for (const pathname of [
    "/rest/v1/rpc/consume_demo_access_code",
    "/rest/v1/user_roles",
    "/rest/v1/user_settings",
  ]) {
    if (countCalls(calls, pathname) !== 0) throw new Error(`unrelated account mutated ${pathname}`);
  }
});

Deno.test("new demo users receive the server-owned code binding", async () => {
  const { calls, response } = await runScenario({ existingUser: false });

  if (response.status !== 200) throw new Error(`new demo user returned ${response.status}`);
  const createCall = calls.find((call) => call.pathname === "/auth/v1/admin/users" && call.method === "POST");
  const appMetadata = createCall?.body?.app_metadata;
  if (
    typeof appMetadata !== "object" || appMetadata === null ||
    !("demo_access_code_id" in appMetadata) || appMetadata.demo_access_code_id !== demoCode.id
  ) {
    throw new Error("new demo user lacks an app_metadata code binding");
  }
});

Deno.test("a bound account with a banned role stays banned and cannot consume a use", async () => {
  const { calls, response } = await runScenario({
    appMetadata: { demo_access_code_id: demoCode.id },
    currentRole: "banned",
  });

  if (response.status !== 403) throw new Error(`bound banned account returned ${response.status}`);
  if (countCalls(calls, "/rest/v1/rpc/consume_demo_access_code") !== 0) {
    throw new Error("bound banned account consumed a demo-code use");
  }
  if (calls.some((call) => call.pathname === "/rest/v1/user_roles" && call.method !== "GET")) {
    throw new Error("bound banned account changed its role");
  }
});

Deno.test("attempt-store errors fail closed before code lookup", async () => {
  const { calls, response } = await runScenario({ attemptLookupFails: true });

  if (response.status !== 500) throw new Error(`attempt-store failure returned ${response.status}`);
  if (countCalls(calls, "/rest/v1/demo_access_codes") !== 0) {
    throw new Error("attempt-store failure continued to code lookup");
  }
});

Deno.test("sends sign-in links back to a DebateLab preview but not to a foreign host", async () => {
  const linkFor = async (redirectTo: string) => {
    const { calls } = await runScenario({ existingUser: false, redirectTo });
    const call = calls.find((entry) => entry.pathname === "/auth/v1/admin/generate_link");
    return JSON.stringify(call?.body ?? null) + decodeURIComponent(call?.search ?? "");
  };
  const preview = "https://debatelab-staging-git-main-adam-gaborjanis-projects.vercel.app/app";
  const sent = await linkFor(preview);
  if (!sent.includes(preview)) throw new Error(`preview redirect was dropped: ${sent}`);
  if ((await linkFor("https://evil.example.com/app")).includes("evil.example.com")) {
    throw new Error("foreign redirect was passed to generate_link");
  }
});

Deno.test("anonymous demo attempts use a shared unknown bucket and fail closed", async () => {
  const attempts = Array.from({ length: 10 }, () => ({ ip_address: null, browser_fingerprint: null, success: false, failure_reason: "not_found", created_at: new Date().toISOString() }));
  const { response, calls } = await runScenario({ attempts });
  if (response.status !== 429) throw new Error(`unknown bucket returned ${response.status}`);
  if (countCalls(calls, "/rest/v1/demo_access_codes")) throw new Error("limited unknown caller reached code lookup");
});

Deno.test("demo limiter excludes its refusals, invalid formats, successes, old and unrelated attempts", async () => {
  for (const identity of [{}, { ipAddress: "192.0.2.1" }, { browserFingerprint: "test-browser" }]) {
    const base = { ip_address: "ipAddress" in identity ? identity.ipAddress! : null, browser_fingerprint: "browserFingerprint" in identity ? identity.browserFingerprint! : null, success: false, failure_reason: "not_found", created_at: new Date().toISOString() };
    const attempts = [
      ...Array.from({ length: 9 }, () => ({ ...base, failure_reason: null })),
      ...["rate_limited", "invalid_format"].map((failure_reason) => ({ ...base, failure_reason })),
      { ...base, success: true },
      { ...base, created_at: "2000-01-01T00:00:00.000Z" },
      { ...base, ip_address: "192.0.2.2", browser_fingerprint: "other-browser" },
    ];
    const { response } = await runScenario({ ...identity, attempts, existingUser: false });
    if (response.status !== 200) throw new Error(`excluded attempts locked out caller: ${response.status}`);
    const limited = await runScenario({ ...identity, attempts: [...attempts, base] });
    if (limited.response.status !== 429) throw new Error("ten real failures did not limit caller");
  }
});
