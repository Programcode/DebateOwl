// Subscription gating, rate limiting, and usage logging shared by the AI
// endpoints. Previously copy-pasted into ai/ and ai-stream/, where the two
// copies had already drifted apart on trial handling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { calculateRequestCost, type CostResult, type NormalizedUsage } from "./cost.ts";
import {
  AUTO_PRO,
  getModelCatalogEntry,
  isAutoModelSelection,
  type ModelSelection,
} from "./model-catalog.ts";
import { WEEKLY_AI_BUDGET_USD, PRO_DAILY_LIMIT, quotaUnitsFor, SESSION_QUOTA, TRIAL_DAILY_LIMIT } from "./usage-limits.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export interface RateLimitResult {
  allowed: boolean;
  canAccessProModels?: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  code?: "limit_reached" | "weekly_budget_reached" | "trial_expired" | "banned" | "upgrade_required";
  /** Quota units this request needed; more than 1 for expensive models. */
  units?: number;
  statusCode?: number;
  /** This request reserved units. False for a later call in a session that already paid. */
  charged?: boolean;
  /** The Crossfire or Sparring session this request was charged under. */
  session?: QuotaSession;
  /** Names this request's session charge, so a refund gives back only that charge. */
  sessionChargeId?: number;
  /** UTC day a per-call reservation was made; refund_daily_quota gives back only today's units. */
  reservedOn?: string;
}

const utcDay = () => new Date().toISOString().slice(0, 10);

/** One Crossfire or Sparring round, charged once (see SESSION_QUOTA). */
export interface QuotaSession {
  feature: keyof typeof SESSION_QUOTA;
  key: string;
}

const QUOTA_SESSION_KEY = /^[A-Za-z0-9._:-]{1,128}$/;

/** A client-supplied session key the ledger accepts, or null. */
export function parseQuotaSessionKey(value: unknown): string | null {
  return typeof value === "string" && QUOTA_SESSION_KEY.test(value) ? value : null;
}

export interface SubscriptionInfo {
  tier: string; // 'trial' | 'pro' | 'legacy_free' | 'expired'
  dailyLimit: number;
  canAccessProModels: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
}

export async function checkUserBanned(userId: string): Promise<boolean> {
  // maybeSingle: a user with no role row is not banned. .single() asks PostgREST
  // for exactly one object and logs a 406 when the row is absent.
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "banned";
}

export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  const { data: user } = await supabase
    .from("user_settings")
    .select("subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at")
    .eq("user_id", userId)
    .single();

  // A settings row is provisioned for every account by the on_auth_user_created
  // trigger and can no longer be deleted by the client (see 20260819000000
  // security_hardening.sql). A missing row is therefore untrusted, not a new
  // user — fail closed instead of granting a fresh trial.
  if (!user) return { tier: "expired", dailyLimit: 0, canAccessProModels: false, trialEndsAt: null, gracePeriodEndsAt: null };

  const tier = user.subscription_tier || "trial";
  const limitOrDefault = (defaultLimit: number) => user.daily_limit_override ?? defaultLimit;
  const now = new Date();
  const expired = { tier: "expired", dailyLimit: limitOrDefault(0), canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
  const activeGiftTrial = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const giftTrialInfo = activeGiftTrial && now < activeGiftTrial
    ? { tier: "trial", dailyLimit: limitOrDefault(TRIAL_DAILY_LIMIT), canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at }
    : null;

  // Legacy free users in grace period get pro-level access
  if (tier === "legacy_free") {
    const graceEnd = user.grace_period_ends_at ? new Date(user.grace_period_ends_at) : null;
    if (graceEnd && now < graceEnd) {
      return { tier: "legacy_free", dailyLimit: limitOrDefault(PRO_DAILY_LIMIT), canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }
    if (giftTrialInfo) return giftTrialInfo;
    // Grace period expired — treat as expired
    return expired;
  }

  // Pro subscribers or promo Pro access. Stripe Pro must have an active
  // subscription period; promo Pro uses grace_period_ends_at, with lifetime
  // promo codes represented by a far-future date.
  if (tier === "pro") {
    const promoEnd = user.grace_period_ends_at ? new Date(user.grace_period_ends_at) : null;
    if (promoEnd && now < promoEnd) {
      return { tier: "pro", dailyLimit: limitOrDefault(PRO_DAILY_LIMIT), canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }

    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("current_period_end", { ascending: false })
      .limit(1);

    const activeSubscription = subscriptions?.find((sub) =>
      sub.current_period_end && new Date(sub.current_period_end) > now
    );

    if (activeSubscription) {
      return { tier: "pro", dailyLimit: limitOrDefault(PRO_DAILY_LIMIT), canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }

    if (giftTrialInfo) return giftTrialInfo;
    return expired;
  }

  // Trial users
  if (tier === "trial") {
    const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
    if (trialEnd && now < trialEnd) {
      return { tier: "trial", dailyLimit: limitOrDefault(TRIAL_DAILY_LIMIT), canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }
    // Trial expired
    return expired;
  }

  if (giftTrialInfo) return giftTrialInfo;

  // Expired
  return expired;
}

async function readRateLimit(userId: string | null, limitType: string): Promise<number | null> {
  // Production rate_limits has id, user_id, limit_type, limit_value, created_at.
  // Ordering by updated_at is a 400, and the client used to ignore that error,
  // so every per-account and global override was silently dropped.
  const query = supabase
    .from("rate_limits")
    .select("limit_value")
    .eq("limit_type", limitType);
  const scoped = userId === null ? query.is("user_id", null) : query.eq("user_id", userId);
  const { data, error } = await scoped
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[RATE LIMIT] rate_limits lookup failed:", error.message);
    return null;
  }
  return typeof data?.limit_value === "number" ? data.limit_value : null;
}

export async function getConfiguredDailyLimit(userId: string, fallbackLimit: number, limitType = "daily_requests"): Promise<number> {
  const userLimit = await readRateLimit(userId, limitType);
  if (userLimit !== null) return userLimit;

  const globalLimit = await readRateLimit(null, limitType);
  if (globalLimit !== null) return globalLimit;

  return fallbackLimit;
}

type AccessCheck =
  | { denied: RateLimitResult }
  | { denied?: undefined; tier: string; dailyLimit: number; canAccessProModels: boolean };

// Ban, plan, and model access: everything that refuses a request before quota is read.
async function checkAccess(userId: string, model?: ModelSelection): Promise<AccessCheck> {
  if (await checkUserBanned(userId)) {
    return { denied: { allowed: false, reason: "Your account has been suspended. Please contact support.", code: "banned", statusCode: 403 } };
  }

  const sub = await getSubscriptionInfo(userId);
  const dailyLimit = sub.tier === "expired" && sub.dailyLimit === 0
    ? 0
    : await getConfiguredDailyLimit(userId, sub.dailyLimit);

  // Trial/access expired
  if (sub.tier === "expired" && dailyLimit === 0) {
    return { denied: { allowed: false, reason: "Your free trial has ended. Upgrade to Pro to continue using DebateLab.", code: "trial_expired", limit: 0, current: 0, statusCode: 402 } };
  }

  if (model && (model === AUTO_PRO || (!isAutoModelSelection(model) && getModelCatalogEntry(model)?.isProOnly)) && !sub.canAccessProModels) {
    return { denied: { allowed: false, reason: "This model requires a Pro subscription. Upgrade to unlock advanced models.", code: "upgrade_required", statusCode: 403 } };
  }

  if (dailyLimit <= 0) {
    return { denied: { allowed: false, reason: "Your daily request limit is currently set to zero. Contact support if this seems wrong.", code: "limit_reached", limit: 0, current: 0, statusCode: 402 } };
  }

  return { tier: sub.tier, dailyLimit, canAccessProModels: sub.canAccessProModels };
}

function quotaDenial(deniedBy: unknown, tier: string, dailyLimit: number, current: number, units: number): RateLimitResult {
  if (deniedBy === "weekly") {
    return { allowed: false, reason: "You've reached this week's AI usage allowance. It resets on Monday at 00:00 UTC. Contact support if you need more.", code: "weekly_budget_reached", limit: dailyLimit, current, units, statusCode: 402 };
  }
  const remaining = Math.max(0, dailyLimit - current);
  const reason = units > dailyLimit
    ? `This model counts as ${units} requests, more than your daily limit of ${dailyLimit}. Pick a lighter model.`
    : remaining > 0
    ? `This model counts as ${units} requests and you have ${remaining} left today. Pick a lighter model or wait until midnight UTC.`
    : `You've used all ${dailyLimit} of your daily requests. ${tier === "pro" ? "Limit resets at midnight UTC." : `Upgrade to Pro for ${PRO_DAILY_LIMIT} daily requests.`}`;
  return { allowed: false, reason, code: "limit_reached", limit: dailyLimit, current, units, statusCode: 402 };
}

/**
 * Checks access and reserves quota for one AI request. With a session, only
 * the session's first call (or one past its call cap or lifetime) reserves
 * units; the rest pass with `charged: false`.
 */
export async function checkRateLimit(userId: string | null, model?: ModelSelection, session?: QuotaSession): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // Anonymous users not rate limited (for now)

  try {
    const access = await checkAccess(userId, model);
    if (access.denied) return access.denied;
    const { tier, dailyLimit, canAccessProModels } = access;

    // Atomically reserve today's quota units server-side so concurrent requests
    // can't race past the limit. Expensive models reserve several units, and
    // the same call refuses users over the weekly AI budget (see
    // 20261022130001_weighted_quota_weekly_budget.sql). Sessions go through
    // the ledger in 20261022220000_ai_quota_sessions.sql.
    const units = quotaUnitsFor(model);
    const reserve = (perSession: QuotaSession | undefined) => perSession
      ? supabase.rpc("claim_ai_session_quota", {
        p_user_id: userId,
        p_feature: perSession.feature,
        p_session_key: perSession.key,
        p_limit: dailyLimit,
        p_units: units,
        p_weekly_cap_usd: WEEKLY_AI_BUDGET_USD,
        p_max_calls: SESSION_QUOTA[perSession.feature].maxCalls,
        p_ttl_seconds: SESSION_QUOTA[perSession.feature].ttlSeconds,
      })
      : supabase.rpc("consume_ai_quota", {
        p_user_id: userId,
        p_limit: dailyLimit,
        p_units: units,
        p_weekly_cap_usd: WEEKLY_AI_BUDGET_USD,
      });
    let { data: quota, error: quotaError } = await reserve(session);
    // A database without 20261022220000_ai_quota_sessions.sql (functions
    // deployed before the migration) charges per call, as before.
    if (session && quotaError && isMissingFunction(quotaError)) {
      console.warn("[RATE LIMIT] Session quota ledger missing; charging per call");
      session = undefined;
      ({ data: quota, error: quotaError } = await reserve(undefined));
    }

    if (quotaError) {
      console.error("[RATE LIMIT] Quota reservation failed:", quotaError);
      return { allowed: false, reason: "Unable to verify your quota. Please try again.", statusCode: 500 };
    }

    const quotaRow = Array.isArray(quota) ? quota[0] : quota;
    const current = quotaRow?.current_count ?? 0;

    if (!quotaRow?.allowed) return quotaDenial(quotaRow?.denied_by, tier, dailyLimit, current, units);

    const charged = session ? quotaRow.charged === true : true;
    const sessionCharge = session && charged && typeof quotaRow.charge_id === "number" ? { sessionChargeId: quotaRow.charge_id } : {};
    return { allowed: true, limit: dailyLimit, current, units, canAccessProModels, charged, ...(session ? { session } : { reservedOn: utcDay() }), ...sessionCharge };
  } catch (err) {
    console.error("[RATE LIMIT] Check failed:", err);
    return { allowed: false, reason: "Unable to verify your account access. Please try again.", statusCode: 500 };
  }
}

/**
 * What a new request or session on this model would cost and whether it fits
 * today, without reserving anything. Pages show it before a session starts.
 */
export async function peekRateLimit(userId: string, model?: ModelSelection): Promise<RateLimitResult> {
  try {
    const access = await checkAccess(userId, model);
    if (access.denied) return { ...access.denied, units: quotaUnitsFor(model) };
    const { tier, dailyLimit } = access;
    const units = quotaUnitsFor(model);
    const { data, error } = await supabase.rpc("peek_ai_quota", { p_user_id: userId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const current = typeof row?.current_count === "number" ? row.current_count : 0;
    const weekSpend = Number(row?.week_spend_usd ?? 0);
    if (WEEKLY_AI_BUDGET_USD !== null && weekSpend >= WEEKLY_AI_BUDGET_USD) {
      return quotaDenial("weekly", tier, dailyLimit, current, units);
    }
    if (current + units > dailyLimit) return quotaDenial("daily", tier, dailyLimit, current, units);
    return { allowed: true, limit: dailyLimit, current, units };
  } catch (err) {
    console.error("[RATE LIMIT] Quota peek failed:", err);
    return { allowed: false, reason: "Unable to verify your quota. Please try again.", statusCode: 500 };
  }
}

/**
 * Gives back exactly what checkRateLimit reserved for a request that produced
 * nothing: the same `units`, which follow the requested selection (Auto Pro
 * reserves 5 even when it resolves to Haiku). A session call that did not pay
 * has nothing to give back, and a session charge is returned only while no
 * other call has run on it. Returns whether units went back. A failed refund
 * is logged, never thrown, so the student still gets the error.
 */
export async function refundQuotaReservation(userId: string, reservation: Pick<RateLimitResult, "allowed" | "units" | "charged" | "session" | "sessionChargeId" | "reservedOn">): Promise<boolean> {
  if (!reservation.allowed || !reservation.units || reservation.charged === false) return false;
  // refund_daily_quota lowers today's counter. Past midnight UTC that would
  // credit the new day for units spent yesterday, so the run stays charged.
  if (!reservation.session && reservation.reservedOn && reservation.reservedOn !== utcDay()) return false;
  try {
    if (reservation.session) {
      if (!reservation.sessionChargeId) return false;
      const { data, error } = await supabase.rpc("refund_ai_session_quota", {
        p_user_id: userId,
        p_feature: reservation.session.feature,
        p_session_key: reservation.session.key,
        p_charge_id: reservation.sessionChargeId,
      });
      if (error) throw error;
      return typeof data === "number" && data > 0;
    }
    const { error } = await supabase.rpc("refund_daily_quota", { p_user_id: userId, p_units: reservation.units });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[RATE LIMIT] Quota refund failed:", err);
    return false;
  }
}

/** PostgREST's "function not found" (PGRST202), or Postgres's undefined_function. */
function isMissingFunction(error: { code?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

// ai_requests.error_code holds a short code the admin views can group by.
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;

/**
 * A short snake_case code passes through. Anything else (an exception name,
 * provider text) is mapped to a normalized code, and the raw text goes only
 * to the function log, truncated.
 */
export function normalizeErrorCode(errorCode: string | undefined): string | undefined {
  if (errorCode === undefined || ERROR_CODE_PATTERN.test(errorCode)) return errorCode;
  console.warn("[USAGE LOG] Normalized raw error code:", errorCode.slice(0, 300));
  if (/abort|cancel/i.test(errorCode)) return "aborted";
  if (/time(d)?\s*out|timeout|deadline/i.test(errorCode)) return "timeout";
  if (/rate.?limit|too many requests|\b429\b/i.test(errorCode)) return "rate_limited";
  return "provider_error";
}

export async function logUsage(
  userId: string | null,
  feature: string,
  provider: string,
  model: string,
  usage?: NormalizedUsage,
  latencyMs?: number,
  status: string = "success",
  errorCode?: string,
) {
  try {
    const cost: CostResult = usage
      ? calculateRequestCost({ provider, model, usage })
      : calculateRequestCost({ provider, model });

    const row: Record<string, unknown> = {
      user_id: userId,
      feature,
      provider,
      model,
      input_tokens: cost.inputTokens,
      output_tokens: cost.outputTokens,
      latency_ms: latencyMs,
      status,
      error_code: normalizeErrorCode(errorCode),
      cost_usd: cost.costUsd,
      // Weekly spend cap input (20261022130001_weighted_quota_weekly_budget.sql).
      cap_cost_usd: cost.capCostUsd,
      // Audit columns added by migration 20260822000000_ai_request_cost_audit.sql.
      cached_input_tokens: cost.cachedInputTokens,
      cache_write_tokens: cost.cacheWriteTokens,
      reasoning_output_tokens: cost.reasoningOutputTokens,
      pricing_snapshot_id: cost.pricingSnapshotId,
      pricing_source_url: cost.pricingSourceUrl,
      cost_calculation_version: cost.costCalculationVersion,
      raw_usage: cost.rawUsage ?? null,
    };

    const { error } = await supabase.from("ai_requests").insert(row);
    if (error) throw error;
  } catch (err) {
    console.warn("[USAGE LOG] Failed to log:", err);
  }
}
