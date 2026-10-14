// Entitlement behaviour that ai/, ai-stream/ and voice/ share.

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { getSubscriptionInfo, checkRateLimit } = await import("./entitlements.ts");
const { entitlementRows } = await import("./testing/entitlement.ts");

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

interface Routes {
  entitlement?: unknown;
  entitlementStatus?: number;
  user_roles?: unknown;
  rate_limits?: unknown;
  quota?: unknown;
}

async function withSupabase<T>(routes: Routes, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.includes("/rpc/effective_entitlement")) {
      return json(routes.entitlement ?? entitlementRows("trial"), routes.entitlementStatus ?? 200);
    }
    if (url.pathname.includes("/rest/v1/user_roles")) return json(routes.user_roles ?? { role: "user" });
    if (url.pathname.includes("/rest/v1/rate_limits")) return json(routes.rate_limits ?? null);
    if (url.pathname.includes("/rpc/consume_daily_quota")) return json(routes.quota ?? [{ allowed: true, current_count: 1 }]);
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

// The tier rules live in effective_entitlement() and are tested in
// supabase/tests/app_store_entitlements_test.sql. These tests cover what stays
// here: reading the plan, failing closed, and the quota and ban checks.

Deno.test("the plan comes from effective_entitlement for that user", async () => {
  let body = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    body = String(init?.body ?? (input instanceof Request ? await input.text() : ""));
    return json(entitlementRows("basic", { trial_ends_at: "2099-01-01T00:00:00.000Z" }));
  }) as typeof fetch;
  try {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(JSON.parse(body).p_user_id, "user-1", "p_user_id");
    assertEquals(info.tier, "basic", "tier");
    assertEquals(info.dailyLimit, 20, "dailyLimit");
    assertEquals(info.canAccessProModels, false, "canAccessProModels");
    assertEquals(info.trialEndsAt, "2099-01-01T00:00:00.000Z", "trialEndsAt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a failed or empty plan lookup fails closed instead of granting a trial", async () => {
  for (const routes of [
    { entitlement: { code: "PGRST202", message: "not found" }, entitlementStatus: 404 },
    { entitlement: [] },
  ]) {
    await withSupabase(routes, async () => {
      const info = await getSubscriptionInfo("user-1");
      assertEquals(info.tier, "expired", "tier");
      assertEquals(info.dailyLimit, 0, "dailyLimit");
      assertEquals(info.canAccessProModels, false, "canAccessProModels");
    });
  }
});

Deno.test("expired access with an extra-limit override is still allowed", async () => {
  await withSupabase({ entitlement: entitlementRows("expired", { daily_limit: 15 }) }, async () => {
    const result = await checkRateLimit("user-1");
    assertEquals(result.allowed, true, "allowed");
    assertEquals(result.limit, 15, "limit");
  });
});

Deno.test("Pro models are refused below Pro before any quota is consumed", async () => {
  let quotaConsumed = false;
  await withSupabase({
    entitlement: entitlementRows("basic"),
    get quota() { quotaConsumed = true; return [{ allowed: true, current_count: 1 }]; },
  }, async () => {
    const result = await checkRateLimit("user-1", "auto-pro");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "upgrade_required", "code");
    assertEquals(quotaConsumed, false, "quota must not be consumed");
  });
});

Deno.test("banned users are refused before any quota is consumed", async () => {
  let quotaConsumed = false;
  await withSupabase({
    user_roles: { role: "banned" },
    get quota() { quotaConsumed = true; return [{ allowed: true, current_count: 1 }]; },
  }, async () => {
    const result = await checkRateLimit("user-1", "openai/gpt-5.6-luna");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "banned", "code");
    assertEquals(result.statusCode, 403, "statusCode");
    assertEquals(quotaConsumed, false, "quota must not be consumed for a banned user");
  });
});

Deno.test("anonymous callers bypass the rate limit", async () => {
  const result = await checkRateLimit(null);
  assertEquals(result.allowed, true, "allowed");
});

Deno.test("an exhausted quota reports the limit-reached code", async () => {
  await withSupabase({
    entitlement: entitlementRows("trial"),
    quota: [{ allowed: false, current_count: 5 }],
  }, async () => {
    const result = await checkRateLimit("user-1");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "limit_reached", "code");
    assertEquals(result.limit, 5, "limit");
    assertEquals(result.current, 5, "current");
  });
});

Deno.test("expired access is refused with the trial-expired code", async () => {
  await withSupabase({
    entitlement: entitlementRows("expired"),
  }, async () => {
    const result = await checkRateLimit("user-1");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "trial_expired", "code");
    assertEquals(result.statusCode, 402, "statusCode");
  });
});
