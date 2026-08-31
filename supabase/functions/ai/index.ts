// Supabase Edge Function: AI proxy for DebateLab
// Keeps provider keys server-side and returns structured JSON.

// Inline CORS headers to avoid import issues
// SECURITY: Using production domain. Localhost calls from dev browser work because 
// browsers accept specific origin even when request is from different origin.
// SECURITY: Allow specific origins for CORS
const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321", // Local Supabase
  "capacitor://localhost"
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring";

type Source = {
  title: string;
  content: string;
  origin?: string;
  type: string;
};

// Generate unique request ID for tracing
function generateRequestId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Structured logger for consistent log format
function log(requestId: string, level: "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>) {
  const logObj = { requestId, level, message, ...data, timestamp: new Date().toISOString() };
  if (level === "ERROR") {
    console.error(JSON.stringify(logObj));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(logObj));
  } else {
    console.log(JSON.stringify(logObj));
  }
}

// ============== SUPABASE CLIENT ==============

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAskBasePrompt, buildUserPrompt } from "./prompt-builder.ts";
import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
} from "../_shared/control-enforcement.ts";
import { buildSystemPrompt } from "../_shared/prompts.ts";
import {
  claimSparringScoreSession,
  completeClaimedSparringScoreSession,
  createSparringSpeechIntegrityToken,
  deriveSparringIntegritySecret,
  normalizeSparringOutput,
  parseSparringProviderOutput,
  parseSparringRequest,
  releaseSparringScoreClaim,
  verifySparringTranscriptIntegrity,
  type SparringDatabase,
  type SparringDatabaseSchema,
  type SparringRequest,
} from "./sparring-persistence.ts";
import {
  calculateRequestCost,
  type CostResult,
  mergeNormalizedUsage,
  normalizeAnthropicUsage,
  normalizeGoogleUsage,
  normalizeOpenAIUsage,
  selectObservedUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  ASK_RESEARCH,
  applyFactoidsVerification,
  buildDiscoveredSources,
  buildResearchContext,
  DEEP_RESEARCH,
  deepResearch,
  decideAskSearch,
  exaGetContents,
  fetchJsonWithTimeout,
  getResearchSources,
  verifyUrl,
  withResearchPreferences,
  type Provider,
  type ResearchContext,
  type ResearchDeps,
  type ResearchSource,
} from "../_shared/research.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const sparringSupabase = createClient<SparringDatabaseSchema>(supabaseUrl, supabaseServiceKey);
const sparringIntegritySecret = Deno.env.get("SPARRING_INTEGRITY_SECRET")?.trim()
  || await deriveSparringIntegritySecret(supabaseServiceKey);

function narrowSparringDatabase(database: object): SparringDatabase {
  return database as SparringDatabase;
}

// ============== RATE LIMITING & SUBSCRIPTION GATING ==============

// Pro-only models: require active subscription
const PRO_MODELS = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "gemini-3.1-pro-preview",
]);

// Every model this endpoint will call, mapped to its provider. The client
// picks a model; the server derives (and trusts) the provider from this
// allowlist rather than the client-supplied provider field, so an arbitrary
// or unlisted model/provider pair can never reach a provider API or bypass
// PRO_MODELS gating.
const MODEL_PROVIDERS: Record<string, Provider> = {
  "gpt-5.5": "openai",
  "gpt-5.4": "openai",
  "gpt-5.4-mini": "openai",
  "claude-opus-4-7": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "claude-haiku-4-5-20251001": "anthropic",
  "gemini-3.1-pro-preview": "google",
  "gemini-3-flash-preview": "google",
  "gemini-3.1-flash-lite-preview": "google",
  // Also served by ai-stream's allowlist; without this entry the model works
  // while streaming but fails on every non-streaming (advanced) Ask request.
  "gemini-3.5-flash": "google",
};

function providerForModel(model: string): Provider {
  const provider = MODEL_PROVIDERS[model];
  if (!provider) throw new Error("Unsupported model or provider combination");
  return provider;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  code?: "limit_reached" | "trial_expired" | "banned" | "upgrade_required";
  statusCode?: number;
}

interface SubscriptionInfo {
  tier: string; // 'trial' | 'pro' | 'legacy_free' | 'expired'
  dailyLimit: number;
  canAccessProModels: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
}

async function checkUserBanned(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  return data?.role === "banned";
}

async function getGlobalPrompt(feature: string): Promise<string | null> {
  // First try feature-specific prompt
  const { data: featurePrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", feature)
    .eq("is_active", true)
    .single();

  if (featurePrompt?.prompt_text) {
    return featurePrompt.prompt_text;
  }

  // Fall back to 'all' prompt
  const { data: allPrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", "all")
    .eq("is_active", true)
    .single();

  return allPrompt?.prompt_text || null;
}

async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
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
    ? { tier: "trial", dailyLimit: limitOrDefault(5), canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at }
    : null;

  // Legacy free users in grace period get pro-level access
  if (tier === "legacy_free") {
    const graceEnd = user.grace_period_ends_at ? new Date(user.grace_period_ends_at) : null;
    if (graceEnd && now < graceEnd) {
      const limit = limitOrDefault(50);
      return { tier: "legacy_free", dailyLimit: limit, canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
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
      const limit = limitOrDefault(50);
      return { tier: "pro", dailyLimit: limit, canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
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
      const limit = limitOrDefault(50);
      return { tier: "pro", dailyLimit: limit, canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }

    if (giftTrialInfo) return giftTrialInfo;
    return expired;
  }

  // Trial users
  if (tier === "trial") {
    const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
    if (trialEnd && now < trialEnd) {
      const limit = limitOrDefault(5);
      return { tier: "trial", dailyLimit: limit, canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }
    // Trial expired
    return expired;
  }

  if (giftTrialInfo) return giftTrialInfo;

  // Expired
  return expired;
}

async function getConfiguredDailyLimit(userId: string, fallbackLimit: number): Promise<number> {
  const { data: userLimit } = await supabase
    .from("rate_limits")
    .select("limit_value")
    .eq("user_id", userId)
    .eq("limit_type", "daily_requests")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (typeof userLimit?.limit_value === "number") {
    return userLimit.limit_value;
  }

  const { data: globalLimit } = await supabase
    .from("rate_limits")
    .select("limit_value")
    .is("user_id", null)
    .eq("limit_type", "daily_requests")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (typeof globalLimit?.limit_value === "number") {
    return globalLimit.limit_value;
  }

  return fallbackLimit;
}

async function checkRateLimit(userId: string | null, model?: string): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // Anonymous users not rate limited (for now)

  try {
    // First check if user is banned
    const isBanned = await checkUserBanned(userId);
    if (isBanned) {
      return { allowed: false, reason: "Your account has been suspended. Please contact support.", code: "banned", statusCode: 403 };
    }

    // Get subscription info
    const sub = await getSubscriptionInfo(userId);
    const dailyLimit = sub.tier === "expired" && sub.dailyLimit === 0
      ? 0
      : await getConfiguredDailyLimit(userId, sub.dailyLimit);

    // Check if trial/access expired (limit = 0)
    if (sub.tier === "expired" && dailyLimit === 0) {
      return {
        allowed: false,
        reason: "Your free trial has ended. Upgrade to Pro to continue using DebateLab.",
        code: "trial_expired",
        limit: 0,
        current: 0,
        statusCode: 402,
      };
    }

    // Check model access
    if (model && PRO_MODELS.has(model) && !sub.canAccessProModels) {
      return {
        allowed: false,
        reason: "This model requires a Pro subscription. Upgrade to unlock advanced models.",
        code: "upgrade_required",
        statusCode: 403,
      };
    }

    if (dailyLimit <= 0) {
      return {
        allowed: false,
        reason: "Your daily request limit is currently set to zero. Contact support if this seems wrong.",
        code: "limit_reached",
        limit: 0,
        current: 0,
        statusCode: 402,
      };
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
    const currentCount = quotaRow?.current_count ?? 0;

    if (!quotaRow?.allowed) {
      return {
        allowed: false,
        reason: `You've used all ${dailyLimit} of your daily requests. ${sub.tier === "pro" ? "Limit resets at midnight UTC." : "Upgrade to Pro for 50 daily requests."}`,
        code: "limit_reached",
        limit: dailyLimit,
        current: currentCount,
        statusCode: 402,
      };
    }

    return { allowed: true, limit: dailyLimit, current: currentCount };
  } catch (err) {
    console.error("[RATE LIMIT] Check failed:", err);
    return { allowed: false, reason: "Unable to verify your account access. Please try again.", statusCode: 500 };
  }
}

async function logUsage(
  userId: string | null,
  feature: string,
  provider: Provider,
  model: string,
  usage?: NormalizedUsage,
  latencyMs?: number,
  status: string = "success",
  errorCode?: string
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
    };

    // Audit columns added by migration 20260822000000_ai_request_cost_audit.sql.
    const auditFields: Record<string, unknown> = {
      cached_input_tokens: cost.cachedInputTokens,
      cache_write_tokens: cost.cacheWriteTokens,
      reasoning_output_tokens: cost.reasoningOutputTokens,
      pricing_snapshot_id: cost.pricingSnapshotId,
      pricing_source_url: cost.pricingSourceUrl,
      cost_calculation_version: cost.costCalculationVersion,
      raw_usage: cost.rawUsage ?? null,
    };

    let { error } = await supabase.from("ai_requests").insert({ ...row, ...auditFields });
    // Retry only when the audit columns do not exist yet (Postgres 42703 or
    // PostgREST PGRST204). Any other error must not retry: the first insert
    // may have committed, and a second would double-log the request.
    const isMissingColumn = error?.code === "42703" || error?.code === "PGRST204";
    if (error && isMissingColumn) {
      console.warn("[USAGE LOG] Audit columns missing; logging base row only:", error.message);
      ({ error } = await supabase.from("ai_requests").insert(row));
    }
    if (error) throw error;
  } catch (err) {
    console.warn("[USAGE LOG] Failed to log:", err);
  }
}

function badRequest(message: string, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_INPUT_LENGTH = 50000;
const MAX_ASK_CONTEXT_LENGTH = 32000;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|text)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*:\s*\[/i,
  /<!--\s*system\s*:/i,
  /\[\s*SYSTEM\s*\]/i,
  /\{\s*"role"\s*:\s*"system"/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|\s*system\s*\|>/i,
  /<system>/i,
  /###\s*instruction/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
];

function sanitizePromptInput(input: string, fieldName: string): { sanitized: string; truncated: boolean } | { rejected: string } {
  if (typeof input !== "string") return { sanitized: "", truncated: false };
  const sanitized = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[SECURITY] Prompt injection attempt detected in ${fieldName}: ${sanitized.slice(0, 200)}`);
      return { rejected: `Suspicious content detected in ${fieldName}` };
    }
  }
  if (sanitized.length > MAX_INPUT_LENGTH) {
    console.warn(`[SECURITY] Input truncated in ${fieldName}: ${sanitized.length} chars -> ${MAX_INPUT_LENGTH}`);
    return { sanitized: sanitized.slice(0, MAX_INPUT_LENGTH), truncated: true };
  }
  return { sanitized, truncated: false };
}

function sanitizeInput(input: Record<string, unknown>): { sanitized: Record<string, unknown>; truncated: boolean } | { rejected: string } {
  const result: Record<string, unknown> = {};
  let truncated = false;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const sanitizeResult = sanitizePromptInput(value, key);
      if ("rejected" in sanitizeResult) return sanitizeResult;
      truncated = truncated || sanitizeResult.truncated;
      result[key] = sanitizeResult.sanitized;
    } else if (Array.isArray(value)) {
      const sanitizedArray: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "object" && item !== null && "content" in item) {
          const contentResult = sanitizePromptInput(String((item as Record<string, unknown>).content || ""), `${key}[${i}].content`);
          if ("rejected" in contentResult) return contentResult;
          truncated = truncated || contentResult.truncated;
          sanitizedArray.push({ ...item, content: contentResult.sanitized });
        } else {
          sanitizedArray.push(item);
        }
      }
      result[key] = sanitizedArray;
    } else {
      result[key] = value;
    }
  }
  return { sanitized: result, truncated };
}

function truncateTextToBudget(text: string, budget: number): { text: string; truncated: boolean } {
  if (budget <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= budget) return { text, truncated: false };
  return { text: text.slice(0, budget) + "\n[Context truncated to fit request limits.]", truncated: true };
}

class InvalidJsonResponseError extends Error {
  readonly providerName: string;
  readonly rawText: string;
  /** Token usage of the failed attempt so repair retries can bill it. */
  usage?: NormalizedUsage;

  constructor(providerName: string, rawText: string) {
    super(`${providerName} returned invalid JSON`);
    this.name = "InvalidJsonResponseError";
    this.providerName = providerName;
    this.rawText = rawText;
  }
}

/**
 * Parses provider content, attaching the attempt's token usage to a parse
 * failure so callAI's repair retry can fold it into the final accounting.
 */
function parseProviderContent(
  text: string,
  providerName: string,
  usage: NormalizedUsage | undefined
): { output: unknown; usage?: NormalizedUsage } {
  try {
    return { output: parseJsonFromText(text, providerName), usage };
  } catch (err) {
    if (err instanceof InvalidJsonResponseError && usage) err.usage = usage;
    throw err;
  }
}

function parseJsonFromText(text: string, providerName: string) {
  if (!text) throw new Error(`${providerName} returned empty response content`);
  try {
    return JSON.parse(text);
  } catch {
    const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (codeBlock?.[1]) {
      try { return JSON.parse(codeBlock[1]); } catch { /* fall through */ }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
  }
  throw new InvalidJsonResponseError(providerName, text);
}

// ============== AI PROVIDER CALLS ==============

function cleanGeneratedText(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[—–]/g, ", ")
      .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (Array.isArray(value)) return value.map(cleanGeneratedText);
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cleaned[key] = cleanGeneratedText(child);
    }
    return cleaned;
  }
  return value;
}

interface AIResult {
  output: unknown;
  usage?: NormalizedUsage;
}

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: unknown;
};

type AnthropicResponse = {
  content?: Array<{ text?: string }>;
  usage?: unknown;
};

type GoogleResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: unknown;
};

function normalizeProviderUsage(provider: Provider, usage: unknown): NormalizedUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const raw = usage as Record<string, unknown>;
  if (provider === "openai") return normalizeOpenAIUsage(raw);
  if (provider === "anthropic") return normalizeAnthropicUsage(raw);
  return normalizeGoogleUsage(raw);
}

async function callAI(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  signal?: AbortSignal
): Promise<AIResult> {
  try {
    return await callAIOnce(provider, model, systemPrompt, messages, temperature, signal);
  } catch (err) {
    if (!(err instanceof InvalidJsonResponseError)) throw err;

    console.warn(`[AI] ${err.providerName} returned invalid JSON; retrying with repair prompt`);
    let retry: AIResult;
    try {
      retry = await callAIOnce(
        provider,
        model,
        `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: Return only valid JSON matching this schema, no prose.`,
        withJsonRepairPrompt(messages),
        0,
        signal,
      );
    } catch (retryError) {
      // Preserve the completed first attempt if cancellation or another
      // failure prevents the repair attempt from returning a result.
      const retryUsage = retryError && typeof retryError === "object" && "usage" in retryError
        ? (retryError as { usage?: NormalizedUsage }).usage
        : undefined;
      const usage = mergeNormalizedUsage([err.usage, retryUsage]);
      if (usage && retryError && typeof retryError === "object") {
        const errorWithUsage = retryError as {
          usage?: NormalizedUsage;
          completedUsage?: NormalizedUsage;
        };
        errorWithUsage.usage = usage;
        // The first response was parsed before the retry began, so retain it
        // even if the retry is the operation cancelled by the caller.
        errorWithUsage.completedUsage = err.usage;
      }
      throw retryError;
    }
    // The failed attempt still consumed tokens; bill both.
    return {
      output: retry.output,
      usage: mergeNormalizedUsage([err.usage, retry.usage]),
    };
  }
}

function withJsonRepairPrompt(messages: Array<{ role: string; content: string }>) {
  const repair = "Your previous response was not valid JSON. Return only valid JSON matching this schema, no prose. Re-answer the original request as a single JSON object. Do not include markdown fences or explanations.";
  if (messages.length === 0) return [{ role: "user", content: repair }];

  const repaired = [...messages];
  const last = repaired[repaired.length - 1];
  if (last.role === "user") {
    repaired[repaired.length - 1] = { ...last, content: `${last.content}\n\n${repair}` };
    return repaired;
  }

  repaired.push({ role: "user", content: repair });
  return repaired;
}

async function callAIOnce(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  signal?: AbortSignal
): Promise<AIResult> {
  const effectiveSystemPrompt = systemPrompt;
  if (provider === "openai") {
    return await callOpenAI([{ role: "system", content: effectiveSystemPrompt }, ...messages], model, temperature, signal);
  } else if (provider === "anthropic") {
    return await callAnthropic(messages, model, temperature, effectiveSystemPrompt, signal);
  } else if (provider === "google") {
    return await callGoogle(messages, model, temperature, effectiveSystemPrompt, signal);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string, temperature: number, signal?: AbortSignal): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const { response, data, errorBody } = await fetchJsonWithTimeout<OpenAIResponse>("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, response_format: { type: "json_object" } }),
  }, 60000, signal);
  if (!response.ok) { const text = errorBody ?? ""; throw new Error(`OpenAI error: ${text}`); }
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) throw new Error("OpenAI returned no choices");
  return parseProviderContent(data.choices[0]?.message?.content ?? "", "OpenAI", normalizeProviderUsage("openai", data.usage));
}

async function callAnthropic(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string, signal?: AbortSignal): Promise<AIResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const { response, data, errorBody } = await fetchJsonWithTimeout<AnthropicResponse>("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, system, messages, max_tokens: 4096, temperature }),
  }, 60000, signal);
  if (!response.ok) { const text = errorBody ?? ""; throw new Error(`Anthropic error: ${text}`); }
  if (!data?.content || !Array.isArray(data.content) || data.content.length === 0) throw new Error("Anthropic returned no content");
  return parseProviderContent(data.content[0]?.text || "", "Anthropic", normalizeProviderUsage("anthropic", data.usage));
}

async function callGoogle(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string, signal?: AbortSignal): Promise<AIResult> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const payload = { contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature, responseMimeType: "application/json" } };
  const { response, data, errorBody } = await fetchJsonWithTimeout<GoogleResponse>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 60000, signal);
  if (!response.ok) { const text = errorBody ?? ""; throw new Error(`Google error: ${text}`); }
  if (!data?.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) throw new Error("Google returned no candidates");
  return parseProviderContent(data.candidates[0]?.content?.parts?.[0]?.text || "", "Google", normalizeProviderUsage("google", data.usageMetadata));
}

function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []).map((url) => url.replace(/[),.;!?]+$/g, ""));
}

// Dynamic date context for prompts - ensures AI knows the current year
function getCurrentDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  return `CURRENT DATE: ${now.toLocaleDateString('en-US', options)} (${now.getFullYear()})`;
}

// ============== MAIN HANDLER ==============

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    log(requestId, "WARN", "Invalid JSON body received");
    return badRequest("Invalid JSON body", corsHeaders);
  }
  const feature = body.feature as Feature | undefined;
  const input = body.input as Record<string, unknown> | undefined;
  const model = (body.model as string | undefined) || Deno.env.get("AI_DEFAULT_MODEL") || "gemini-3-flash-preview";
  let provider: Provider;
  try {
    provider = providerForModel(model);
  } catch (err) {
    log(requestId, "WARN", "Rejected unsupported model/provider combination", { model });
    return badRequest(err instanceof Error ? err.message : "Unsupported model or provider combination", corsHeaders);
  }
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const customSystemPrompt = body.customSystemPrompt as string | null | undefined;
  const sources = (body.sources as Source[] | undefined) || [];

  // Log incoming request
  log(requestId, "INFO", "Request received", { feature, provider, model, sourcesCount: sources.length });

  if (!feature) return badRequest("Missing feature", corsHeaders);
  if (!input) return badRequest("Missing input", corsHeaders);
  const sanitizeResult = sanitizeInput(input);
  if ("rejected" in sanitizeResult) {
    log(requestId, "WARN", "Request rejected by sanitization", { reason: sanitizeResult.rejected });
    return badRequest(sanitizeResult.rejected, corsHeaders);
  }
  const sanitizedInput = sanitizeResult.sanitized;
  let responseTruncated = sanitizeResult.truncated;
  if (customSystemPrompt) {
    const promptResult = sanitizePromptInput(customSystemPrompt, "customSystemPrompt");
    if ("rejected" in promptResult) {
      log(requestId, "WARN", "Custom prompt rejected", { reason: promptResult.rejected });
      return badRequest(promptResult.rejected, corsHeaders);
    }
    responseTruncated = responseTruncated || promptResult.truncated;
  }
  let validatedSparringRequest: SparringRequest | undefined;
  if (feature === "sparring") {
    const sparringResult = parseSparringRequest(sanitizedInput);
    if ("error" in sparringResult) {
      log(requestId, "WARN", "Invalid sparring request", { reason: sparringResult.error });
      return badRequest(sparringResult.error, corsHeaders);
    }
    validatedSparringRequest = sparringResult.request;
  }
  const successBody = (payload: Record<string, unknown>) => responseTruncated
    ? { ...payload, meta: { truncated: true } }
    : payload;

  // Require a valid user session for all AI requests.
  // The frontend already enforces auth; this protects the endpoint even when
  // gateway JWT verification is disabled.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log(requestId, "WARN", "Missing authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    log(requestId, "WARN", "Auth token validation failed", { error: authError?.message });
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId: string = user.id;
  log(requestId, "INFO", "User authenticated", { userId });
  const sparringDatabase = narrowSparringDatabase(sparringSupabase);
  let sparringScoreClaimed = false;
  let sparringScoreClaimToken: string | undefined;

  if (validatedSparringRequest && !(await verifySparringTranscriptIntegrity(
    validatedSparringRequest,
    userId,
    [sparringIntegritySecret, supabaseServiceKey],
  ))) {
    log(requestId, "WARN", "Rejected sparring transcript with invalid AI-turn integrity");
    return badRequest("Sparring transcript integrity check failed", corsHeaders);
  }

  // Claim a score session before reserving quota or calling a provider. This
  // makes concurrent retries converge and prevents cross-user UUID overwrite.
  if (validatedSparringRequest?.action === "score") {
    let claim: Awaited<ReturnType<typeof claimSparringScoreSession>>;
    try {
      claim = await claimSparringScoreSession(sparringDatabase, validatedSparringRequest, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Score claim failed";
      log(requestId, "ERROR", "Unable to claim sparring score", { error: message });
      return new Response(JSON.stringify({ error: "Unable to start sparring score" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "complete") {
      return new Response(JSON.stringify(successBody({
        output: { action: "score", scorecard: claim.scorecard },
        sessionId: validatedSparringRequest.sessionId,
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (claim.status === "conflict") {
      return new Response(JSON.stringify({ error: "Sparring session ID is already in use" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "in_progress") {
      return new Response(JSON.stringify({ error: "Sparring score is already in progress", code: "score_in_progress" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "cleared") {
      return new Response(JSON.stringify({ error: "This score request began before your data was cleared", code: "data_cleared" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    sparringScoreClaimed = true;
    sparringScoreClaimToken = claim.token;
  }

  // Check rate limits (includes subscription gating and model access)
  let rateLimit: RateLimitResult;
  try {
    rateLimit = await checkRateLimit(userId, model);
  } catch (error) {
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
    }
    const message = error instanceof Error ? error.message : "Rate-limit check failed";
    log(requestId, "ERROR", "Rate-limit check failed", { error: message });
    return new Response(JSON.stringify({ error: "Unable to verify request limits" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!rateLimit.allowed) {
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }
    await logUsage(userId, feature, provider, model, undefined, undefined, "rate_limited", rateLimit.code);
    return new Response(JSON.stringify({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current
    }), {
      status: rateLimit.statusCode || 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const startTime = Date.now();
  // Usage from research sub-calls (search decision, follow-up queries) is
  // collected here so the parent request's row accounts for every token.
  const researchUsage: NormalizedUsage[] = [];
  let researchAccountingIncomplete = false;
  const researchDeps: ResearchDeps = {
    provider,
    model,
    signal: req.signal,
    onTimeout: () => {
      researchAccountingIncomplete = true;
    },
    callModel: async (args) => {
      try {
        const result = await callAI(args.provider, args.model, args.systemPrompt, args.messages, args.temperature, args.signal);
        // A provider that ignores cancellation must not append usage after the
        // research timeout has already been finalized by the parent request.
        if (result.usage && !args.signal?.aborted) researchUsage.push(result.usage);
        return { output: result.output };
      } catch (err) {
        const usageError = err && typeof err === "object"
          ? err as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }
          : undefined;
        const researchErrorUsage = selectObservedUsage(usageError, args.signal?.aborted === true);
        if (researchErrorUsage) researchUsage.push(researchErrorUsage);
        throw err;
      }
    },
  };
  const researchUsageForLog = (): NormalizedUsage[] => [
    ...researchUsage.splice(0),
    ...(researchAccountingIncomplete ? [{ incomplete: true }] : []),
  ];
  // Keep the completed main provider call available if post-processing fails
  // before the normal success-path usage log runs.
  let completedMainUsage: NormalizedUsage | undefined;
  const recordMainResult = (result: AIResult): AIResult => {
    completedMainUsage = result.usage;
    return result;
  };
  // Layered system prompt: identity + task + JSON rules (+ admin/custom/knowledge).
  // Citation-honesty rules are added only when a feature actually obtained web
  // research, never on the promise of it.
  // Research counts only when it actually returned something to cite.
  const hasResearch = (research?: ResearchContext | null): research is ResearchContext =>
    Boolean(research && (research.rankedResults.length > 0 || research.readContent.length > 0));
  const buildSystemPromptFor = async (feature: Feature, research?: ResearchContext | null) =>
    buildSystemPrompt({
      feature,
      dateContext: getCurrentDateContext(),
      globalPrompt: await getGlobalPrompt(feature),
      // User-authored system overrides must not influence a persisted judge.
      customPrompt: feature === "sparring" ? null : customSystemPrompt ?? null,
      // Sparring is transcript-only. Do not let unrelated saved evidence alter
      // an opponent response or a judge's scorecard.
      sources: feature === "sparring" ? [] : sources,
      researchContext: hasResearch(research)
        ? "WEB RESEARCH RESULTS are attached to this request."
        : undefined,
    });
  try {
    // SPARRING: transcript-only opponent replies and scorecards. No research
    // branch runs here, and score persistence follows output validation.
    if (feature === "sparring") {
      const sparringRequest = validatedSparringRequest;
      if (!sparringRequest) throw new Error("Invalid sparring request");

      const systemPrompt = await buildSystemPromptFor(feature);
      const userPrompt = buildUserPrompt(feature, sparringRequest as unknown as Record<string, unknown>, "");
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      const normalizedOutput = normalizeSparringOutput(output, sparringRequest.action);
      const parsedOutput = parseSparringProviderOutput(normalizedOutput, sparringRequest.action);
      if (!parsedOutput) throw new Error("AI response did not match the expected sparring schema");

      if (parsedOutput.action === "score") {
        await completeClaimedSparringScoreSession(
          sparringDatabase,
          sparringRequest,
          userId,
          sparringScoreClaimToken!,
          parsedOutput.scorecard,
        );
        sparringScoreClaimed = false;
      }

      const responseOutput = parsedOutput.action === "respond"
        ? {
          ...parsedOutput,
          speech: {
            ...parsedOutput.speech,
            integrityToken: await createSparringSpeechIntegrityToken(
              sparringRequest,
              userId,
              {
                turnId: sparringRequest.currentTurn!.id,
                side: sparringRequest.currentTurn!.side,
                content: parsedOutput.speech.content,
              },
              sparringIntegritySecret,
            ),
          },
        }
        : parsedOutput;

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({
        output: responseOutput,
        sessionId: sparringRequest.sessionId,
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // FACTOIDS: Use deep research with multiple searches
    if (feature === "factoids") {
      const claim = String(sanitizedInput.claim || "");
      const region = String(sanitizedInput.region || "Global");
      const preferredSourceType = String(sanitizedInput.sourceType || "any");
      const timeframe = String(sanitizedInput.timeframe || "");
      const sourceCount = Math.min(15, Math.max(3, Number(sanitizedInput.sourceCount || 5)));

      // Perform deep research with multiple search rounds
      const research = await deepResearch(claim, region, researchDeps, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType,
        timeframe,
      }));
      const searchContext = buildResearchContext(research);

      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];

      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      // Post-process: quality floor. Only citations whose URL matches fetched,
      // non-weak research content may stay "verified"; everything else is
      // downgraded and filtered out below. Weak sources can appear only as
      // fallback context via discoveredSources, never as verified evidence.
      const factoidsOutput = output as { factoids?: unknown; verificationStatus?: string } | null;
      if (factoidsOutput && typeof factoidsOutput === "object" && Array.isArray(factoidsOutput.factoids)) {
        applyFactoidsVerification(output, research);
        factoidsOutput.factoids = (factoidsOutput.factoids as Array<{ citation?: { verified?: string } }>)
          .filter((f) => f && typeof f === "object" && !Array.isArray(f) && f.citation?.verified === "verified")
          .slice(0, sourceCount);
        factoidsOutput.verificationStatus = "complete";
      }

      const discoveredSources = buildDiscoveredSources(research);

      const latencyMs = Date.now() - startTime;
      if (output && typeof output === "object") {
        const askOutput = output as {
          model?: string;
          provider?: string;
          durationMs?: number;
          generatedAt?: string;
        };
        askOutput.model = model;
        askOutput.provider = provider;
        askOutput.durationMs = latencyMs;
        askOutput.generatedAt = new Date().toISOString();
      }

      // Log usage and return
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ASK: Optionally run web search and include URL context from chat
    if (feature === "ask") {
      const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
      const message = String(sanitizedInput.message || "");
      const mode = String(sanitizedInput.mode || "general");
      const citationMode = Boolean(sanitizedInput.citationMode);
      const webSearchEnabled = Boolean(sanitizedInput.webSearch);
      const prosConsMode = Boolean(sanitizedInput.prosConsMode);
      const argumentMapMode = Boolean(sanitizedInput.argumentMapMode);
      const shouldUseResearch = webSearchEnabled || citationMode;
      let askResearch: ResearchContext | null = null;
      let askSearchQuery = "";

      // 1) Read URLs already shared in chat to ground the response in user-provided material
      const urls = new Set<string>();
      extractUrls(message).forEach((u) => urls.add(u));
      history.slice(-3).forEach((m) => extractUrls(m.content).forEach((u) => urls.add(u)));

      let urlContext = "";
      if (urls.size > 0) {
        const contents = await Promise.all(Array.from(urls).slice(0, 3).map(async (u) => {
          const content = await exaGetContents(u, req.signal);
          return `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`;
        }));
        urlContext = "\n\nWEB PAGE CONTEXT:\n" + contents.join("\n");
      }

      // 2) Optional web search in Ask mode. When the user explicitly enables
      // web search or citations, perform research instead of leaving it to the model.
      let webSearchContext = "";
      if (shouldUseResearch) {
        const searchDecision = await decideAskSearch(message, history, researchDeps);
        askSearchQuery = searchDecision.query || message.slice(0, 240);
        if (askSearchQuery) {
          askResearch = await deepResearch(askSearchQuery, "", researchDeps, ASK_RESEARCH);
          if (askResearch.searches.length > 0 || askResearch.readContent.length > 0) {
            webSearchContext = `\n\n${buildResearchContext(askResearch)}`;
          }
        }
      }

      const systemPrompt = await buildSystemPromptFor(feature, askResearch);
      const basePrompt = buildAskBasePrompt({
        message,
        mode,
        citationMode,
        webSearchEnabled,
        prosConsMode,
        argumentMapMode,
        researchAvailable: Boolean(webSearchContext || urlContext),
      });
      const contextBudget = Math.max(0, MAX_ASK_CONTEXT_LENGTH - basePrompt.length);
      const webSearchBudget = Math.max(0, contextBudget - urlContext.length);
      const trimmedWebSearch = truncateTextToBudget(webSearchContext, webSearchBudget);
      webSearchContext = trimmedWebSearch.text;
      responseTruncated = responseTruncated || trimmedWebSearch.truncated;

      const urlBudget = Math.max(0, contextBudget - webSearchContext.length);
      const trimmedUrlContext = truncateTextToBudget(urlContext, urlBudget);
      urlContext = trimmedUrlContext.text;
      responseTruncated = responseTruncated || trimmedUrlContext.truncated;

      const prompt = `${basePrompt}${urlContext}${webSearchContext}`;
      const messages = [...history, { role: "user", content: prompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      if (output && typeof output === "object") {
        const typedOutput = output as {
          citations?: Array<{ claim: string; source?: string; verified?: boolean; note?: string }>;
          searchInfo?: { webSearchUsed: boolean; queries: string[]; sources: ResearchSource[] };
          uncertainties?: string[];
        };
        const citations = typedOutput.citations;
        if (Array.isArray(citations)) {
          await Promise.all(citations.map(async (citation) => {
            const source = typeof citation.source === "string" ? citation.source : "";
            const url = extractUrls(source)[0];
            if (!url) return;
            citation.verified = await verifyUrl(url);
          }));
        }

        const researchSources = askResearch ? getResearchSources(askResearch) : [];
        if (shouldUseResearch) {
          typedOutput.searchInfo = {
            webSearchUsed: researchSources.length > 0,
            queries: askResearch?.searches.map((search) => search.query) || (askSearchQuery ? [askSearchQuery] : []),
            sources: researchSources,
          };
        } else {
          delete typedOutput.searchInfo;
        }

        const citationFallbackSources = researchSources.filter((source) => source.qualityLabel !== "weak");
        if (citationMode && citationFallbackSources.length > 0 && (!Array.isArray(typedOutput.citations) || typedOutput.citations.length === 0)) {
          typedOutput.citations = citationFallbackSources.slice(0, 3).map((source) => ({
            claim: "Research source used for this answer",
            source: source.url,
            verified: source.verified,
            note: `${source.title} (${source.qualityLabel} ${source.sourceType})`,
          }));
          typedOutput.uncertainties = Array.isArray(typedOutput.uncertainties)
            ? typedOutput.uncertainties
            : [];
        } else if (citationMode && researchSources.length > 0 && citationFallbackSources.length === 0) {
          typedOutput.citations = [];
          typedOutput.uncertainties = [
            ...(Array.isArray(typedOutput.uncertainties) ? typedOutput.uncertainties : []),
            "Search ran, but the available sources were too weak for citation fallback.",
          ];
        }
        // Deterministic control enforcement runs last so fallback citations
        // respect the toggles too, and clarify mode always surfaces its note.
        enforceAskControls(typedOutput, { mode, citationMode, prosConsMode, argumentMapMode });
      }

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GENERATE: Use deep research for evidence-backed arguments
    if (feature === "generate") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "pro");
      const format = String(sanitizedInput.format || "custom");
      const length = String(sanitizedInput.length || "standard");
      const role = String(sanitizedInput.role || "intro");

      // Perform deep research to find supporting evidence
      console.log("[GENERATE] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", researchDeps, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType: "any",
      }));
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      // Post-process: force needsSource to false since we provided research
      if (output && typeof output === "object" && "contentions" in output) {
        const contentions = (output as { contentions: Array<{ needsSource?: boolean }> }).contentions;
        for (const c of contentions) {
          c.needsSource = false;
        }
      }

      // Post-process: fix timestamp
      if (output && typeof output === "object" && "metadata" in output) {
        const metadata = (output as { metadata: { generatedAt?: string; model?: string; provider?: string; durationMs?: number } }).metadata;
        if (!metadata.generatedAt ||
          metadata.generatedAt === "CURRENT_ISO_TIMESTAMP" ||
          metadata.generatedAt.includes("CURRENT") ||
          isNaN(new Date(metadata.generatedAt).getTime())) {
          metadata.generatedAt = new Date().toISOString();
        }
        metadata.model = model;
        metadata.provider = provider;
      }
      enforceGenerateControls(output, side, format, length, role);

      // Build discovered sources from research
      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[GENERATE] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      if (output && typeof output === "object" && "metadata" in output) {
        const metadata = (output as { metadata: { durationMs?: number } }).metadata;
        metadata.durationMs = latencyMs;
      }
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // BRAINSTORM: Use research to inform argument angles
    if (feature === "brainstorm") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "both");
      const outputMode = String(sanitizedInput.outputMode || "topfive");

      // Perform deep research to find relevant context
      console.log("[BRAINSTORM] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", researchDeps, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      enforceBrainstormControls(output, side, outputMode);

      // Build discovered sources from research
      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[BRAINSTORM] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ATTACK: Use deep research for evidence-based critique
    if (feature === "attack") {
      const caseText = String(sanitizedInput.caseText || "");
      const detectFallacies = typeof sanitizedInput.detectFallacies === "boolean" ? sanitizedInput.detectFallacies : true;
      const analyzeWeighing = typeof sanitizedInput.analyzeWeighing === "boolean" ? sanitizedInput.analyzeWeighing : true;

      // Research the topic to find counter-evidence
      console.log("[ATTACK] Starting deep research for case analysis");
      const research = await deepResearch(caseText.slice(0, 500), "", researchDeps, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      enforceAttackControls(output, detectFallacies, analyzeWeighing);

      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[ATTACK] Found ${discoveredSources.length} sources`);

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback for any other feature
    const systemPrompt = await buildSystemPromptFor(feature);
    const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
    const messages = [{ role: "user", content: userPrompt }];
    const fallbackResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, req.signal));
    const output = cleanGeneratedText(fallbackResult.output);

    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, mergeNormalizedUsage([fallbackResult.usage, ...researchUsageForLog()]), latencyMs);
    return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERROR]", message);

    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }

    // Log error
    const latencyMs = Date.now() - startTime;
    const usageError = err && typeof err === "object"
      ? err as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }
      : undefined;
    // A successful main call takes precedence over usage attached to a later
    // post-processing error. This avoids counting its repair attempts twice.
    const mainErrorUsage = completedMainUsage ?? selectObservedUsage(usageError, req.signal?.aborted === true);
    await logUsage(
      userId,
      feature,
      provider,
      model,
      mergeNormalizedUsage([
        mainErrorUsage,
        ...researchUsageForLog(),
      ]),
      latencyMs,
      "error",
      message.slice(0, 100),
    );
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
