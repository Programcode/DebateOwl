// Entitlement behaviour that ai/ and ai-stream/ now share. The two copies had
// drifted on the gift-trial fallback; these tests pin the surviving semantics.

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { getSubscriptionInfo, checkRateLimit, peekRateLimit, getConfiguredDailyLimit, checkUserBanned, normalizeErrorCode } = await import("./entitlements.ts");
const { MODEL_QUOTA_UNITS, WEEKLY_AI_BUDGET_USD } = await import("./usage-limits.ts");

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + DAY).toISOString();
const past = () => new Date(Date.now() - DAY).toISOString();

interface Routes {
  user_settings?: unknown | ((url: URL) => Response);
  user_roles?: unknown;
  subscriptions?: unknown | ((url: URL) => Response);
  rate_limits?: unknown | ((url: URL) => Response);
  quota?: unknown;
  peek?: unknown;
  onQuota?: (body: Record<string, unknown>) => void;
  requests?: string[];
}

async function withSupabase<T>(routes: Routes, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.includes("/rest/v1/user_settings")) {
      return typeof routes.user_settings === "function" ? routes.user_settings(url) : json(routes.user_settings ?? null);
    }
    if (url.pathname.includes("/rest/v1/user_roles")) return json(routes.user_roles ?? { role: "user" });
    if (url.pathname.includes("/rest/v1/subscriptions")) {
      return typeof routes.subscriptions === "function" ? routes.subscriptions(url) : json(routes.subscriptions ?? []);
    }
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
    if (url.pathname.includes("/rpc/peek_ai_quota")) return json(routes.peek ?? [{ current_count: 0, week_spend_usd: 0 }]);
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

Deno.test("a request without a user is refused, not waved through (SC-03)", async () => {
  let quotaConsumed = false;
  await withSupabase({
    get quota() { quotaConsumed = true; return [{ allowed: true, current_count: 1 }]; },
  }, async () => {
    const result = await checkRateLimit(null);
    assertEquals(result.allowed, false, "allowed");
    assertEquals(result.code, "unauthenticated", "code");
    assertEquals(result.statusCode, 401, "statusCode");
    assertEquals(quotaConsumed, false, "quota must not be consumed without a user");
  });
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

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

// Each account without access is refused with a code naming why (QB-13, QB-14).
for (const [name, routes, code] of [
  ["an expired trial", { user_settings: { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: past(), grace_period_ends_at: null } }, "trial_ended"],
  ["a past-due payer after the grace", {
    user_settings: { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: null },
    subscriptions: [{ status: "past_due", current_period_start: daysFromNow(-20), current_period_end: daysFromNow(10) }],
  }, "payment_failed"],
  ["a former subscriber", {
    user_settings: { subscription_tier: "expired", daily_limit_override: null, trial_ends_at: daysFromNow(-60), grace_period_ends_at: null },
    subscriptions: [{ status: "canceled", current_period_start: daysFromNow(-40), current_period_end: daysFromNow(-10), ended_at: daysFromNow(-10) }],
  }, "subscription_ended"],
] as const) {
  Deno.test(`${name} is refused with ${code}`, async () => {
    let quotaConsumed = false;
    await withSupabase({
      ...routes,
      get quota() { quotaConsumed = true; return [{ allowed: true, current_count: 1 }]; },
    }, async () => {
      const result = await checkRateLimit("user-1");
      assertEquals(result.allowed, false, "allowed");
      assertEquals(result.code, code, "code");
      assertEquals(result.statusCode, 402, "statusCode");
      assertEquals(quotaConsumed, false, "quota must not be consumed");
    });
  });
}

Deno.test("an override on an expired trial keeps working as extended access (QB-02)", async () => {
  // Adam's decision: daily_limit_override on an expired trial is a deliberate grant.
  let reserved: Record<string, unknown> | undefined;
  await withSupabase({
    user_settings: { subscription_tier: "trial", daily_limit_override: 5, trial_ends_at: past(), grace_period_ends_at: null },
    onQuota: (body) => { reserved = body; },
  }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.state, "extended_access", "state");
    assertEquals(info.refusal, null, "refusal");
    const result = await checkRateLimit("user-1");
    assertEquals(result.allowed, true, "allowed");
    assertEquals(result.canAccessProModels, false, "canAccessProModels");
    assertEquals(reserved?.p_limit, 5, "limit reserved against");
  });
});

Deno.test("a past-due payer keeps Pro through the payment grace (QB-13)", async () => {
  await withSupabase({
    // The tier the old webhook wrote on the first failed invoice.
    user_settings: { subscription_tier: "expired", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: null },
    subscriptions: [{ status: "past_due", current_period_start: daysFromNow(-2), current_period_end: daysFromNow(28) }],
  }, async () => {
    const info = await getSubscriptionInfo("user-1");
    assertEquals(info.state, "payment_failed", "state");
    assertEquals(info.dailyLimit, 50, "dailyLimit");
    assertEquals(info.canAccessProModels, true, "canAccessProModels");
    assertEquals((await checkRateLimit("user-1", "anthropic/claude-sonnet-5.5")).allowed, true, "allowed");
  });
});

Deno.test("a failed subscriptions read still serves access the settings row proves", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withSupabase({
      user_settings: { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: future(), grace_period_ends_at: null },
      subscriptions: () => json({ message: "boom", code: "XX000" }, 500),
    }, async () => {
      assertEquals((await checkRateLimit("user-1")).allowed, true, "allowed");
    });
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("a failed subscriptions read fails closed", async () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    await withSupabase({
      user_settings: { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: null },
      subscriptions: () => json({ message: "boom", code: "XX000" }, 500),
    }, async () => {
      const result = await checkRateLimit("user-1");
      assertEquals(result.allowed, false, "allowed");
      assertEquals(result.statusCode, 500, "statusCode");
    });
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
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

async function sentWeeklyCap(settings: Routes["user_settings"]): Promise<unknown> {
  let sent: Record<string, unknown> = {};
  await withSupabase({ user_settings: settings, onQuota: (body) => { sent = body; } }, async () => {
    assertEquals((await checkRateLimit("user-1", "openai/gpt-6-luna")).allowed, true, "allowed");
  });
  return sent.p_weekly_cap_usd;
}

Deno.test("an account without a weekly override gets the global cap", async () => {
  assertEquals(await sentWeeklyCap({ ...proUser, weekly_budget_override_usd: null, weekly_budget_unlimited: false }), WEEKLY_AI_BUDGET_USD, "p_weekly_cap_usd");
});

Deno.test("a weekly override replaces the global cap", async () => {
  // PostgREST sends numeric as a number or a string.
  assertEquals(await sentWeeklyCap({ ...proUser, weekly_budget_override_usd: 25, weekly_budget_unlimited: false }), 25, "number");
  assertEquals(await sentWeeklyCap({ ...proUser, weekly_budget_override_usd: "7.5", weekly_budget_unlimited: false }), 7.5, "string");
  assertEquals(await sentWeeklyCap({ ...proUser, weekly_budget_override_usd: 0, weekly_budget_unlimited: false }), 0, "zero");
});

Deno.test("an unlimited account skips the weekly cap, even with an override set", async () => {
  assertEquals(await sentWeeklyCap({ ...proUser, weekly_budget_override_usd: 1, weekly_budget_unlimited: true }), null, "p_weekly_cap_usd");
});

Deno.test("a failed override read keeps the global cap instead of lifting it", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const settings = (url: URL) => (url.searchParams.get("select") ?? "").includes("weekly_budget")
      ? json({ message: "column user_settings.weekly_budget_unlimited does not exist", code: "42703" }, 400)
      : json(proUser);
    assertEquals(await sentWeeklyCap(settings), WEEKLY_AI_BUDGET_USD, "p_weekly_cap_usd");
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("the pre-round quota check uses the account's weekly cap", async () => {
  const spent = [{ current_count: 1, week_spend_usd: (WEEKLY_AI_BUDGET_USD ?? 0) + 3 }];
  await withSupabase({ user_settings: proUser, peek: spent }, async () => {
    assertEquals((await peekRateLimit("user-1", "openai/gpt-6-luna")).code, "weekly_budget_reached", "global cap");
  });
  await withSupabase({ user_settings: { ...proUser, weekly_budget_unlimited: true }, peek: spent }, async () => {
    assertEquals((await peekRateLimit("user-1", "openai/gpt-6-luna")).allowed, true, "unlimited");
  });
  await withSupabase({ user_settings: { ...proUser, weekly_budget_override_usd: 100 }, peek: spent }, async () => {
    assertEquals((await peekRateLimit("user-1", "openai/gpt-6-luna")).allowed, true, "raised cap");
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

Deno.test("ai_requests.error_code keeps codes and never stores raw provider text", () => {
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    for (const [raw, code] of [
      [undefined, undefined],
      ["claude_unavailable", "claude_unavailable"],
      ["elevenlabs_503", "elevenlabs_503"],
      ["AbortError", "aborted"],
      ["Request timed out after 120s", "timeout"],
      ["Rate limit exceeded: too many requests for model x", "rate_limited"],
      ["OpenRouter error: {\"message\":\"Provider returned error\",\"metadata\":{\"raw\":\"...\"}}", "provider_error"],
    ] as const) {
      assertEquals(normalizeErrorCode(raw), code, `normalizeErrorCode(${raw})`);
    }
  } finally {
    console.warn = warn;
  }
});
