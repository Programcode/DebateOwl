function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

for (
  const [key, value] of Object.entries({
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    WORKSPACE_INVITE_SECRET: "test-workspace-invite-secret-with-enough-entropy",
  })
) Deno.env.set(key, value);
for (
  const key of [
    "WORKSPACE_INVITE_MAILER_URL",
    "WORKSPACE_INVITE_MAILER_TOKEN",
    "WORKSPACE_INVITE_BASE_URL",
  ]
) Deno.env.delete(key);

type TestUser = {
  id: string;
  email: string;
  email_confirmed_at?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
};

const actor: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@example.com",
  email_confirmed_at: "2026-09-20T12:00:00.000Z",
  app_metadata: {},
  user_metadata: { email: "forged@example.com" },
  aud: "authenticated",
  created_at: "2026-09-20T12:00:00.000Z",
};

const workspaceId = "22222222-2222-4222-8222-222222222222";
const inviteId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";

type RpcResult = Record<string, unknown> | Record<string, unknown>[];

type Scenario = {
  rpc?: Record<string, RpcResult | { error: string }>;
  user?: TestUser;
};

async function runScenario(
  body: Record<string, unknown>,
  scenario: Scenario = {},
  sender?: (message: { to: string; inviteUrl: string }) => Promise<void>,
  baseUrl?: string,
) {
  const calls: Array<
    { body: Record<string, unknown> | null; pathname: string }
  > = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch =
    (async (input: Request | URL | string, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      const url = new URL(request.url);
      const text = request.method === "GET" ? "" : await request.clone().text();
      const requestBody = text
        ? JSON.parse(text) as Record<string, unknown>
        : null;
      calls.push({ body: requestBody, pathname: url.pathname });

      if (url.pathname === "/auth/v1/user") {
        return jsonResponse(scenario.user ?? actor);
      }

      const rpcName = url.pathname.split("/rest/v1/rpc/")[1];
      if (rpcName) {
        const result = scenario.rpc?.[rpcName];
        if (result && "error" in result) {
          return jsonResponse({ message: result.error }, 500);
        }
        if (result !== undefined) return jsonResponse(result);
        throw new Error(`Unhandled RPC: ${rpcName}`);
      }

      throw new Error(
        `Unhandled Supabase request: ${request.method} ${url.pathname}`,
      );
    }) as typeof fetch;

  try {
    const { handleRequest } = await import("./index.ts");
    const response = await handleRequest(
      new Request(
        "http://127.0.0.1/functions/v1/workspace-invites",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-user-token",
            "Content-Type": "application/json",
            "X-Forwarded-For": "198.51.100.20, 203.0.113.9",
          },
          body: JSON.stringify(body),
        },
      ),
      sender ? { sender, baseUrl } : undefined,
    );
    return { calls, response };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function rpcCall(
  calls: Awaited<ReturnType<typeof runScenario>>["calls"],
  name: string,
) {
  return calls.find((call) => call.pathname === `/rest/v1/rpc/${name}`);
}

Deno.test("code creation returns one high-entropy code and sends only its digest to Postgres", async () => {
  const { calls, response } = await runScenario({
    action: "create_code",
    workspaceId,
    requestId,
    maxUses: 4,
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: "2026-09-22T12:00:00.000Z",
        max_uses: 4,
        replayed: false,
      }],
    },
  });

  const payload = await response.json();
  if (response.status !== 201) {
    throw new Error(`code creation returned ${response.status}`);
  }
  if (!/^WS-(?:[A-Z2-7]{4}-){4}[A-Z2-7]{4}$/.test(payload.code)) {
    throw new Error("code does not carry 100 bits of base32 invite material");
  }
  const call = rpcCall(calls, "create_workspace_invite");
  if (!call?.body || typeof call.body.p_secret_digest !== "string") {
    throw new Error("code digest was not sent to the invite RPC");
  }
  const serialized = JSON.stringify(call.body);
  if (serialized.includes(payload.code)) {
    throw new Error("raw code reached Postgres");
  }
  if (
    serialized.includes("198.51.100.20") || serialized.includes("203.0.113.9")
  ) {
    throw new Error("raw client IP reached Postgres");
  }
});

Deno.test("code rotation revokes the selected code through the create RPC", async () => {
  const { calls, response } = await runScenario({
    action: "rotate_code",
    workspaceId,
    inviteId,
    requestId,
    maxUses: 2,
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: "55555555-5555-4555-8555-555555555555",
        expires_at: "2026-09-22T12:00:00.000Z",
        max_uses: 2,
        replayed: false,
      }],
    },
  });

  if (response.status !== 201) {
    throw new Error(`code rotation returned ${response.status}`);
  }
  const call = rpcCall(calls, "create_workspace_invite");
  if (
    call?.body?.p_rotate_invite_id !== inviteId || call.body.p_kind !== "code"
  ) {
    throw new Error("rotate_code did not bind the old code to its replacement");
  }
});

Deno.test("code revocation routes to the dedicated service RPC", async () => {
  const { calls, response } = await runScenario({
    action: "revoke",
    workspaceId,
    inviteId,
    requestId,
  }, {
    rpc: { revoke_workspace_invite: [{ revoked: true, replayed: false }] },
  });

  if (
    response.status !== 200 ||
    JSON.stringify(await response.json()) !== '{"revoked":true}'
  ) {
    throw new Error(`code revocation returned ${response.status}`);
  }
  const call = rpcCall(calls, "revoke_workspace_invite");
  if (call?.body?.p_invite_id !== inviteId) {
    throw new Error("revoke omitted the selected invite");
  }
});

Deno.test("email creation has one uniform response and sends through the injected boundary", async () => {
  const sent: Array<{ to: string; inviteUrl: string }> = [];
  const { calls, response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: " Student@Example.COM ",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: "2026-09-27T12:00:00.000Z",
        max_uses: 1,
        replayed: false,
      }],
    },
  }, (message) => {
    sent.push(message);
    return Promise.resolve();
  }, "https://invites.test/");

  if (
    response.status !== 202 ||
    JSON.stringify(await response.json()) !== '{"accepted":true}'
  ) {
    throw new Error(
      "email creation did not return the generic accepted response",
    );
  }
  if (sent.length !== 1 || sent[0].to !== "student@example.com") {
    throw new Error(
      "the controlled sender did not receive the normalized target once",
    );
  }
  if (
    !sent[0].inviteUrl.startsWith(
      "https://invites.test/app/workspaces/invite?token=wi_",
    )
  ) {
    throw new Error("email sender did not receive the resolved invite URL");
  }
  if (calls.some((call) => call.pathname.includes("/auth/v1/admin/users"))) {
    throw new Error("email creation performed an Auth-account lookup");
  }
  const call = rpcCall(calls, "create_workspace_invite");
  const serialized = JSON.stringify(call?.body ?? {});
  if (
    serialized.toLowerCase().includes("student@example.com") ||
    serialized.includes("wi_")
  ) {
    throw new Error("plaintext email or token reached Postgres");
  }
});

Deno.test("email replay does not send a second message after delivery", async () => {
  let sendCount = 0;
  const { response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: "2026-09-27T12:00:00.000Z",
        max_uses: 1,
        replayed: true,
      }],
    },
  }, () => {
    sendCount += 1;
    return Promise.resolve();
  });

  if (response.status !== 202 || sendCount !== 0) {
    throw new Error("delivered replay sent another email");
  }
});

Deno.test("missing email relay configuration fails before invite storage", async () => {
  const { calls, response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  });

  if (response.status !== 503) {
    throw new Error(`unconfigured email returned ${response.status}`);
  }
  if (rpcCall(calls, "create_workspace_invite")) {
    throw new Error("unconfigured email stored an invitation");
  }
});

Deno.test("redeem uses the fresh verified Auth email and stores only keyed hashes", async () => {
  const secret = "wi_abcdefghijklmnopqrstuvwxyzABCDEF";
  const { calls, response } = await runScenario({
    action: "redeem",
    requestId,
    token: secret,
  }, {
    rpc: {
      redeem_workspace_invite: [{
        status: "accepted",
        workspace_id: workspaceId,
        already_member: false,
      }],
    },
  });

  const payload = await response.json();
  if (
    response.status !== 200 || payload.workspaceId !== workspaceId ||
    payload.alreadyMember !== false
  ) {
    throw new Error("redeem did not return the membership outcome");
  }
  const call = rpcCall(calls, "redeem_workspace_invite");
  const serialized = JSON.stringify(call?.body ?? {});
  if (
    serialized.includes(secret) || serialized.includes(actor.email) ||
    serialized.includes("forged@example.com")
  ) {
    throw new Error("redeem sent a token or email instead of keyed hashes");
  }
  if (
    serialized.includes("198.51.100.20") || serialized.includes("203.0.113.9")
  ) {
    throw new Error("redeem sent a raw proxy IP");
  }
  if (call?.body?.p_actor_email_hash === null) {
    throw new Error("verified email hash was omitted");
  }
});

Deno.test("an unverified Auth email cannot be supplied to email redemption", async () => {
  const { calls, response } = await runScenario({
    action: "redeem",
    requestId,
    token: "wi_0123456789abcdefghijklmnopqrstuv",
  }, {
    user: { ...actor, email_confirmed_at: undefined },
    rpc: {
      redeem_workspace_invite: [{
        status: "unavailable",
        workspace_id: null,
        already_member: false,
      }],
    },
  });

  if (response.status !== 403) {
    throw new Error(`unverified email redemption returned ${response.status}`);
  }
  const call = rpcCall(calls, "redeem_workspace_invite");
  if (call?.body?.p_actor_email_hash !== null) {
    throw new Error("unverified email produced an email hash");
  }
});

Deno.test("rate-store RPC failure stops redemption with a generic secret-free error", async () => {
  const secret = "WS-AAAA-BBBB-CCCC-DDDD-EEEE";
  const { calls, response } = await runScenario({
    action: "redeem",
    requestId,
    code: secret,
  }, {
    rpc: { redeem_workspace_invite: { error: `store failed near ${secret}` } },
  });

  const text = await response.text();
  if (response.status !== 500 || !text.includes("temporarily unavailable")) {
    throw new Error(`rate-store failure returned ${response.status}: ${text}`);
  }
  if (
    text.includes(secret) || JSON.stringify(calls).includes("198.51.100.20")
  ) {
    throw new Error("a secret or raw IP leaked through the failure path");
  }
});

Deno.test("all actions authenticate through the shared bearer boundary", async () => {
  const { handleRequest } = await import("./index.ts");
  const response = await handleRequest(
    new Request(
      "http://127.0.0.1/functions/v1/workspace-invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_code", workspaceId, requestId }),
      },
    ),
  );

  if (response.status !== 401) {
    throw new Error(`missing bearer token returned ${response.status}`);
  }
});

Deno.test("Capacitor preflight receives the native app origin", async () => {
  const { handleRequest } = await import("./index.ts");
  const response = await handleRequest(
    new Request(
      "http://127.0.0.1/functions/v1/workspace-invites",
      { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } },
    ),
  );

  if (
    response.headers.get("Access-Control-Allow-Origin") !==
      "capacitor://localhost"
  ) {
    throw new Error("workspace invites rejected the Capacitor origin");
  }
});
