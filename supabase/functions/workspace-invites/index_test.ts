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
// Pending email invites must still be valid whenever the suite runs.
const pendingExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const requestId = "44444444-4444-4444-8444-444444444444";

type RpcResult = Record<string, unknown> | Record<string, unknown>[] | boolean;

type SentMessage = {
  to: string;
  inviteUrl: string;
  idempotencyKey?: string;
};

type Scenario = {
  rpc?: Record<string, RpcResult | { error: string }>;
  user?: TestUser;
};

async function runScenario(
  body: Record<string, unknown>,
  scenario: Scenario = {},
  sender?: (message: SentMessage) => Promise<void>,
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
        if (
          typeof result === "object" && result !== null &&
          !Array.isArray(result) && "error" in result
        ) {
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
  const sent: SentMessage[] = [];
  const { calls, response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: " Student@Example.COM ",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: pendingExpiry,
        max_uses: 1,
        replayed: false,
        email_delivered: false,
      }],
      mark_workspace_invite_email_delivered: true,
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
  if (sent[0].idempotencyKey !== `workspace-invite:${inviteId}`) {
    throw new Error("email sender did not receive the stable invite key");
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
  const deliveredCall = rpcCall(
    calls,
    "mark_workspace_invite_email_delivered",
  );
  if (
    deliveredCall?.body?.p_invite_id !== inviteId ||
    deliveredCall.body.p_actor_id !== actor.id
  ) {
    throw new Error("accepted delivery was not marked for the exact invite");
  }
  const deliveredBody = JSON.stringify(deliveredCall.body);
  if (
    deliveredBody.includes("student@example.com") ||
    deliveredBody.includes("wi_") ||
    deliveredBody.includes("198.51.100.20")
  ) {
    throw new Error("delivery marking received private invite material");
  }
});

Deno.test("commit-before-send replay retries pending email delivery", async () => {
  const sent: SentMessage[] = [];
  const { response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: pendingExpiry,
        max_uses: 1,
        replayed: true,
        email_delivered: false,
      }],
      mark_workspace_invite_email_delivered: true,
    },
  }, (message) => {
    sent.push(message);
    return Promise.resolve();
  });

  if (response.status !== 202 || sent.length !== 1) {
    throw new Error("pending replay did not retry delivery");
  }
});

Deno.test("expired pending replay does not send or mark delivery", async () => {
  let sendCount = 0;
  const { calls, response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: "2020-01-01T00:00:00.000Z",
        max_uses: 1,
        replayed: true,
        email_delivered: false,
      }],
    },
  }, () => {
    sendCount += 1;
    return Promise.resolve();
  });

  if (response.status !== 503 || sendCount !== 0) {
    throw new Error("expired pending invite attempted delivery");
  }
  if (rpcCall(calls, "mark_workspace_invite_email_delivered")) {
    throw new Error("expired pending invite was marked delivered");
  }
});

Deno.test("sender acceptance with mark failure retries the same relay key", async () => {
  const sent: SentMessage[] = [];
  const pendingInvite = {
    invite_id: inviteId,
    expires_at: pendingExpiry,
    max_uses: 1,
    replayed: true,
    email_delivered: false,
  };
  const first = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [pendingInvite],
      mark_workspace_invite_email_delivered: { error: "mark failed" },
    },
  }, (message) => {
    sent.push(message);
    return Promise.resolve();
  });
  const second = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [pendingInvite],
      mark_workspace_invite_email_delivered: true,
    },
  }, (message) => {
    sent.push(message);
    return Promise.resolve();
  });

  if (first.response.status !== 500 || second.response.status !== 202) {
    throw new Error("mark failure did not fail generically then recover");
  }
  if (
    sent.length !== 2 || sent[0].idempotencyKey !== sent[1].idempotencyKey ||
    sent[0].idempotencyKey !== `workspace-invite:${inviteId}`
  ) {
    throw new Error("mark retry changed the relay idempotency key");
  }
});

Deno.test("already-delivered replay suppresses email delivery", async () => {
  let sendCount = 0;
  const { calls, response } = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: pendingExpiry,
        max_uses: 1,
        replayed: true,
        email_delivered: true,
      }],
    },
  }, () => {
    sendCount += 1;
    return Promise.resolve();
  });

  if (response.status !== 202 || sendCount !== 0) {
    throw new Error("delivered replay sent another email");
  }
  if (rpcCall(calls, "mark_workspace_invite_email_delivered")) {
    throw new Error("delivered replay marked delivery again");
  }
});

Deno.test("sender failure leaves delivery pending and retryable", async () => {
  const sent: SentMessage[] = [];
  const first = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: pendingExpiry,
        max_uses: 1,
        replayed: false,
        email_delivered: false,
      }],
    },
  }, (message) => {
    sent.push(message);
    return Promise.reject(new Error("relay unavailable"));
  });
  const second = await runScenario({
    action: "create_email",
    workspaceId,
    requestId,
    email: "student@example.com",
  }, {
    rpc: {
      create_workspace_invite: [{
        invite_id: inviteId,
        expires_at: pendingExpiry,
        max_uses: 1,
        replayed: true,
        email_delivered: false,
      }],
      mark_workspace_invite_email_delivered: true,
    },
  }, (message) => {
    sent.push(message);
    return Promise.resolve();
  });

  if (first.response.status !== 503 || second.response.status !== 202) {
    throw new Error("sender failure was not retried from pending state");
  }
  if (
    rpcCall(first.calls, "revoke_workspace_invite") ||
    rpcCall(first.calls, "mark_workspace_invite_email_delivered")
  ) {
    throw new Error("sender failure revoked or delivered the pending invite");
  }
  if (
    sent.length !== 2 || sent[0].idempotencyKey !== sent[1].idempotencyKey
  ) {
    throw new Error("sender retry changed the relay idempotency key");
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
