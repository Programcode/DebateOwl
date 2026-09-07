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

type Scenario = {
  appMetadata?: Record<string, unknown>;
  attemptLookupFails?: boolean;
  currentRole?: string | null;
  existingUser?: boolean;
  userMetadata?: Record<string, unknown>;
};

async function runScenario({
  appMetadata = {},
  attemptLookupFails = false,
  currentRole = "user",
  existingUser = true,
  userMetadata = {},
}: Scenario) {
  const calls: Array<{ body: Record<string, unknown> | null; method: string; pathname: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const bodyText = request.method === "GET" ? "" : await request.clone().text();
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : null;
    calls.push({ body, method: request.method, pathname: url.pathname });

    if (url.pathname === "/rest/v1/demo_access_attempts" && request.method !== "POST") {
      return attemptLookupFails ? jsonResponse({ message: "attempt lookup failed" }, 500) : jsonResponse([]);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "DEMO-AB12-CD34",
        ...(attemptLookupFails ? { browserFingerprint: "test-browser" } : {}),
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
