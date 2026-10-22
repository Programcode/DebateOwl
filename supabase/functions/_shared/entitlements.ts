// Subscription gating, rate limiting, and usage logging shared by the AI
// endpoints. Previously copy-pasted into ai/ and ai-stream/, where the two
// copies had already drifted apart on trial handling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateRequestCost, type CostResult, type NormalizedUsage } from "./cost.ts";
import {
  AUTO_PRO,
  getModelCatalogEntry,
  isAutoModelSelection,
  type ModelSelection,
} from "./model-catalog.ts";

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
  code?: "limit_reached" | "trial_expired" | "banned" | "upgrade_required";
  statusCode?: number;
}

export interface SubscriptionInfo {
  tier: string; // 'trial' | 'basic' | 'pro' | 'legacy_free' | 'expired'
  dailyLimit: number;
  canAccessProModels: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
}

export async function checkUserBanned(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  return data?.role === "banned";
}

// A missing or unreadable plan is untrusted, not a new user: fail closed
// instead of granting a fresh trial.
const NO_ACCESS: SubscriptionInfo = { tier: "expired", dailyLimit: 0, canAccessProModels: false, trialEndsAt: null, gracePeriodEndsAt: null };

/**
 * The user's plan from effective_entitlement() (migration
 * 20261014123154_app_store_entitlements.sql), which merges Stripe, App Store,
 * promo, trial and legacy access into the highest active tier.
 */
export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  const { data, error } = await supabase.rpc("effective_entitlement", { p_user_id: userId });
  if (error) console.error("[ENTITLEMENT] Plan lookup failed:", error.code ?? error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row.tier !== "string" || typeof row.daily_limit !== "number") return NO_ACCESS;
  return {
    tier: row.tier,
    dailyLimit: row.daily_limit,
    canAccessProModels: row.can_access_pro_models === true,
    trialEndsAt: row.trial_ends_at ?? null,
    gracePeriodEndsAt: row.grace_period_ends_at ?? null,
  };
}

export async function getConfiguredDailyLimit(userId: string, fallbackLimit: number, limitType = "daily_requests"): Promise<number> {
  const { data: userLimit } = await supabase
    .from("rate_limits")
    .select("limit_value")
    .eq("user_id", userId)
    .eq("limit_type", limitType)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (typeof userLimit?.limit_value === "number") return userLimit.limit_value;

  const { data: globalLimit } = await supabase
    .from("rate_limits")
    .select("limit_value")
    .is("user_id", null)
    .eq("limit_type", limitType)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return typeof globalLimit?.limit_value === "number" ? globalLimit.limit_value : fallbackLimit;
}

export async function checkRateLimit(userId: string | null, model?: ModelSelection): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // Anonymous users not rate limited (for now)

  try {
    if (await checkUserBanned(userId)) {
      return { allowed: false, reason: "Your account has been suspended. Please contact support.", code: "banned", statusCode: 403 };
    }

    const sub = await getSubscriptionInfo(userId);
    const dailyLimit = sub.tier === "expired" && sub.dailyLimit === 0
      ? 0
      : await getConfiguredDailyLimit(userId, sub.dailyLimit);

    // Trial/access expired
    if (sub.tier === "expired" && dailyLimit === 0) {
      return { allowed: false, reason: "Your free trial has ended. Upgrade to Pro to continue using DebateLab.", code: "trial_expired", limit: 0, current: 0, statusCode: 402 };
    }

    if (model && (model === AUTO_PRO || (!isAutoModelSelection(model) && getModelCatalogEntry(model)?.isProOnly)) && !sub.canAccessProModels) {
      return { allowed: false, reason: "This model requires a Pro subscription. Upgrade to unlock advanced models.", code: "upgrade_required", statusCode: 403 };
    }

    if (dailyLimit <= 0) {
      return { allowed: false, reason: "Your daily request limit is currently set to zero. Contact support if this seems wrong.", code: "limit_reached", limit: 0, current: 0, statusCode: 402 };
    }

    // Atomically reserve today's request slot server-side so concurrent requests
    // can't race past the limit (see consume_daily_quota in the security hardening migration).
    const { data: quota, error: quotaError } = await supabase.rpc("consume_daily_quota", {
      p_user_id: userId,
      p_limit: dailyLimit,
    });

    if (quotaError) {
      console.error("[RATE LIMIT] Quota reservation failed:", quotaError);
      return { allowed: false, reason: "Unable to verify your quota. Please try again.", statusCode: 500 };
    }

    const quotaRow = Array.isArray(quota) ? quota[0] : quota;
    const current = quotaRow?.current_count ?? 0;

    if (!quotaRow?.allowed) {
      return { allowed: false, reason: `You've used all ${dailyLimit} of your daily requests. ${sub.tier === "pro" ? "Limit resets at midnight UTC." : "Upgrade to Pro for 50 daily requests."}`, code: "limit_reached", limit: dailyLimit, current, statusCode: 402 };
    }

    return { allowed: true, limit: dailyLimit, current, canAccessProModels: sub.canAccessProModels };
  } catch (err) {
    console.error("[RATE LIMIT] Check failed:", err);
    return { allowed: false, reason: "Unable to verify your account access. Please try again.", statusCode: 500 };
  }
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
      error_code: errorCode,
      cost_usd: cost.costUsd,
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
