// Entitlement behaviour that ai/ and ai-stream/ now share. The two copies had
// drifted on the gift-trial fallback; these tests pin the surviving semantics.

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { getSubscriptionInfo, checkRateLimit, getConfiguredDailyLimit, checkUserBanned } = await import("./entitlements.ts");
const { MODEL_QUOTA_UNITS, WEEKLY_AI_BUDGET_USD } = await import("./usage-limits.ts");

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + DAY).toISOString();
const past = () => new Date(Date.now() - DAY).toISOString();

interface Routes {
  user_settings?: unknown;
  user_roles?: unknown;
  subscriptions?: unknown;
  rate_limits?: unknown | ((url: URL) => Response);
  quota?: unknown;
  onQuota?: (body: Record<string, unknown>) => void;
  requests?: string[];
}

async function withSupabase<T>(routes: Routes, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.includes("/rest/v1/user_settings")) return json(routes.user_settings ?? null);
    if (url.pathname.includes("/rest/v1/user_roles")) return json(routes.user_roles ?? { role: "user" });
    if (url.pathname.includes("/rest/v1/subscriptions")) return json(routes.subscriptions ?? []);
    if (url.pathname.includes("/rest/v1/rate_limits")) {
      routes.requests?.push(`${url.pathname}${url.search}`);
      const order = url.searchParams.get("order") ?? "";
      if (order.includes("updated_at")) {
        return json({ message: "column rate_limits.updated_at does not exist", code: "42703" }, 400);
      }
      if (typeof routes.rate_limits === "function") return routes.rate_limits(url);
      return json(routes.rate_limits ?? null);
    }
    if (url.pathname.includes("/rpc/consume_ai_quota")) {
      routes.onQuota?.(JSON.parse(String(init?.body ?? "{}")));
      return json(routes.quota ?? [{ allowed: true, current_count: 1 }]);
    }
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

Deno.test("a missing settings row fails closed instead of granting a trial", async () => {
  await withSupabase({ user_settings: null }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.tier, "expired", "tier");
    assertEquals(info.dailyLimit, 0, "dailyLimit");
    assertEquals(info.canAccessProModels, false, "canAccessProModels");
  });
});

Deno.test("an unknown tier still honours an active gift trial", async () => {
  // ai/ applied this fallback, ai-stream/ did not. The shared module keeps the
  // permissive-but-limited branch so a gifted trial is not silently voided.
  await withSupabase({
    user_settings: { subscription_tier: "something_new", daily_limit_override: null, trial_ends_at: future(), grace_period_ends_at: null },
  }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.tier, "trial", "tier");
    assertEquals(info.dailyLimit, 5, "dailyLimit");
    assertEquals(info.canAccessProModels, false, "canAccessProModels");
  });
});

Deno.test("a lapsed pro subscription falls back to an active gift trial", async () => {
  await withSupabase({
    user_settings: { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: future(), grace_period_ends_at: past() },
    subscriptions: [],
  }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.tier, "trial", "tier");
    assertEquals(info.canAccessProModels, false, "canAccessProModels");
  });
});

Deno.test("a promo grace period grants pro model access", async () => {
  await withSupabase({
    user_settings: { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: future() },
  }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.tier, "pro", "tier");
    assertEquals(info.dailyLimit, 50, "dailyLimit");
    assertEquals(info.canAccessProModels, true, "canAccessProModels");
  });
});

Deno.test("daily_limit_override wins over the tier default", async () => {
  await withSupabase({
    user_settings: { subscription_tier: "trial", daily_limit_override: 3, trial_ends_at: future(), grace_period_ends_at: null },
  }, async () => {
    assertEquals((await getSubscriptionInfo("user-1")).dailyLimit, 3, "dailyLimit");
  });
});

Deno.test("banned users are refused before any quota is consumed", async () => {
  let quotaConsumed = false;
  await withSupabase({
    user_roles: { role: "banned" },
    get quota() { quotaConsumed = true; return [{ allowed: true, current_count: 1 }]; },
  }, async () => {
    const result = await checkRateLimit("user-1", "openai/gpt-6-luna");
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
    user_settings: { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: future(), grace_period_ends_at: null },
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
    user_settings: { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: past(), grace_period_ends_at: null },
  }, async () => {
    const result = await checkRateLimit("user-1");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "trial_expired", "code");
    assertEquals(result.statusCode, 402, "statusCode");
  });
});

const proUser = { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: future() };

Deno.test("an expensive model reserves its weighted units and the weekly cap", async () => {
  let sent: Record<string, unknown> = {};
  await withSupabase({ user_settings: proUser, onQuota: (body) => { sent = body; } }, async () => {
    const result = await checkRateLimit("user-1", "anthropic/claude-opus-5.5");
    assertEquals(result.allowed, true, "allowed");
    assertEquals(sent.p_units, MODEL_QUOTA_UNITS["anthropic/claude-opus-5.5"], "p_units");
    assertEquals(sent.p_weekly_cap_usd, WEEKLY_AI_BUDGET_USD, "p_weekly_cap_usd");
  });
  await withSupabase({ user_settings: proUser, onQuota: (body) => { sent = body; } }, async () => {
    await checkRateLimit("user-1", "openai/gpt-6-luna");
    assertEquals(sent.p_units, 1, "cheap model p_units");
  });
});

Deno.test("a weighted refusal says how many requests remain", async () => {
  await withSupabase({ user_settings: proUser, quota: [{ allowed: false, current_count: 47, denied_by: "daily" }] }, async () => {
    const result = await checkRateLimit("user-1", "anthropic/claude-opus-5.5");
    assertEquals(result.code, "limit_reached", "code");
    assertEquals(result.units, 5, "units");
    assertEquals(result.reason?.includes("3 left today"), true, "reason mentions remaining requests");
  });
});

Deno.test("the weekly budget refusal has its own code", async () => {
  await withSupabase({ user_settings: proUser, quota: [{ allowed: false, current_count: 2, denied_by: "weekly" }] }, async () => {
    const result = await checkRateLimit("user-1", "openai/gpt-6-luna");
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "weekly_budget_reached", "code");
    assertEquals(result.statusCode, 402, "statusCode");
  });
});

Deno.test("configured daily limits prefer the account row, then the global row", async () => {
  const requests: string[] = [];
  const limits = (url: URL) => {
    if (url.searchParams.get("user_id") === "eq.user-1") return json({ limit_value: 12 });
    if (url.searchParams.get("user_id") === "is.null") return json({ limit_value: 7 });
    return json(null);
  };
  await withSupabase({ requests, rate_limits: limits }, async () => {
    assertEquals(await getConfiguredDailyLimit("user-1", 5), 12, "per-user row");
  });
  assertEquals(requests.some((query) => query.includes("updated_at")), false, "never orders by updated_at");
  assertEquals(requests.some((query) => query.includes("order=created_at.desc")), true, "orders by created_at");

  await withSupabase({
    rate_limits: (url: URL) => url.searchParams.get("user_id") === "is.null" ? json({ limit_value: 7 }) : json(null),
  }, async () => {
    assertEquals(await getConfiguredDailyLimit("user-1", 5), 7, "global row");
  });

  await withSupabase({ rate_limits: null }, async () => {
    assertEquals(await getConfiguredDailyLimit("user-1", 5), 5, "fallback");
  });
});

Deno.test("a rate_limits lookup error is logged and does not invent a limit", async () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((part) => typeof part === "string" ? part : JSON.stringify(part)).join(" "));
  };
  try {
    await withSupabase({
      rate_limits: () => json({ message: "column rate_limits.updated_at does not exist", code: "42703" }, 400),
    }, async () => {
      assertEquals(await getConfiguredDailyLimit("user-1", 5), 5, "fallback after the error");
    });
  } finally {
    console.warn = original;
  }
  assertEquals(warnings.some((line) => line.includes("[RATE LIMIT]") && line.includes("updated_at")), true, "server warning");
  assertEquals(warnings.some((line) => line.includes("user-1")), false, "warning omits the user id");
});

Deno.test("a user with no role row is not banned and the lookup does not demand one object", async () => {
  let accept = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.includes("/rest/v1/user_roles")) {
      accept = request.headers.get("Accept") ?? request.headers.get("accept") ?? "";
      return json([]);
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }) as typeof fetch;
  try {
    assertEquals(await checkUserBanned("user-1"), false, "not banned");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(accept.includes("vnd.pgrst.object"), false, "Accept must not require a single object");
});

Deno.test("a model heavier than the whole daily limit is not told to wait", async () => {
  const smallLimit = { ...proUser, daily_limit_override: 3 };
  await withSupabase({ user_settings: smallLimit, quota: [{ allowed: false, current_count: 0, denied_by: "daily" }] }, async () => {
    const result = await checkRateLimit("user-1", "anthropic/claude-opus-5.5");
    assertEquals(result.code, "limit_reached", "code");
    assertEquals(result.limit, 3, "limit");
    assertEquals(result.reason?.includes("more than your daily limit of 3"), true, `reason: ${result.reason}`);
    assertEquals(result.reason?.includes("midnight"), false, "reason must not suggest waiting");
  });
});
