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

type Provider = "openai" | "anthropic" | "google";

type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask";

type Source = {
  title: string;
  content: string;
  origin?: string;
  type: string;
};

interface ResearchContext {
  searches: Array<{ query: string; results: string }>;
  rankedResults: RankedSearchResult[];
  readContent: Array<{ url: string; title: string; content: string; result?: RankedSearchResult }>;
  verifiedUrls: Set<string>;
}

interface ResearchOptions {
  maxFollowUpQueries: number; // 0 = skip AI follow-up entirely
  maxUrlsToRead: number;      // How many pages to read in full
  maxSeedQueries: number;     // How many deterministic searches before AI follow-up
  overallTimeoutMs: number;   // Hard timeout for entire research
  preferredSourceType?: string;
  timeframe?: string;
}

const DEEP_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 2,
  maxUrlsToRead: 5,
  maxSeedQueries: 4,
  overallTimeoutMs: 35000,
};

const ASK_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 2,
  maxUrlsToRead: 4,
  maxSeedQueries: 4,
  overallTimeoutMs: 30000,
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
import { buildUserPrompt, getAskModeGuidance } from "./prompt-builder.ts";
import {
  calculateRequestCost,
  type CostResult,
  normalizeAnthropicUsage,
  normalizeGoogleUsage,
  normalizeOpenAIUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  buildSearchQueries,
  formatRankedSearchResults,
  rankSearchResults,
  sourceTitleFromUrl,
  type ExaResult,
  type RankedSearchResult,
  type ResearchSource,
} from "./source-quality.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    if (error) {
      // If the audit columns are not applied yet, still persist the base row.
      console.warn("[USAGE LOG] Retrying without audit fields:", error.message);
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

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

class InvalidJsonResponseError extends Error {
  readonly providerName: string;
  readonly rawText: string;

  constructor(providerName: string, rawText: string) {
    super(`${providerName} returned invalid JSON`);
    this.name = "InvalidJsonResponseError";
    this.providerName = providerName;
    this.rawText = rawText;
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

// ============== EXA FUNCTIONS ==============

// exaSearch: web search using Exa's neural search (type "auto" = balanced relevance & speed)
async function exaSearch(query: string): Promise<ExaResult[]> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return [];
  }
  try {
    const response = await fetchWithTimeout("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "auto",
        num_results: 10,
        contents: { text: { max_characters: 10000 } },
      }),
    }, 30000);
    if (!response.ok) {
      console.warn(`[EXA] Search failed (${response.status}) for: ${query}`);
      return [];
    }
    const data = await response.json();
    if (!data?.results || !Array.isArray(data.results)) return [];
    return data.results.map((r: { title?: string; url?: string; text?: string; publishedDate?: string }) => ({
      title: r.title,
      url: r.url,
      content: r.text,
      publishedDate: r.publishedDate,
    }));
  } catch {
    console.warn(`[EXA] Search failed for: ${query}`);
    return [];
  }
}

// exaGetContents: extract full text from a specific URL using Exa's /contents endpoint
async function exaGetContents(url: string): Promise<string> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return "";
  }
  try {
    const response = await fetchWithTimeout("https://api.exa.ai/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ urls: [url], text: { max_characters: 8000 } }),
    }, 30000);
    if (!response.ok) {
      console.warn(`[EXA] Contents fetch failed (${response.status}) for: ${url}`);
      return "";
    }
    const data = await response.json();
    if (!data?.results || !Array.isArray(data.results) || data.results.length === 0) return "";
    return (data.results[0]?.text || "").slice(0, 8000);
  } catch {
    console.warn(`[EXA] Contents fetch failed for: ${url}`);
    return "";
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  // Do not fetch model-provided citation URLs from the Edge Function. A URL
  // that is syntactically public can still resolve to a private service after
  // validation, and the deployed runtime cannot safely pin DNS resolution.
  // Citations remain visible but are explicitly marked unverified.
  void url;
  return false;
}

// ============== DEEP RESEARCH ==============

const QUERY_GENERATION_PROMPT = `You are a research assistant. Based on the initial claim and search results so far, generate 2-3 follow-up search queries to find more specific evidence.

Return JSON: { "queries": ["query1", "query2", "query3"] }

Keep queries specific, factual, and focused on statistics, studies, or official sources.`;

const ASK_SEARCH_DECISION_PROMPT = `You decide whether a debate coaching answer needs live web research.

Return strict JSON:
{
  "shouldSearch": boolean,
  "query": "string"
}

Set shouldSearch=true when the user asks for current events, recent stats, real-world examples, laws/policies, or anything time-sensitive.
Set shouldSearch=false for timeless coaching (strategy, structure, delivery, framing).
When shouldSearch=true, provide one concise search query.
Do not add any fields.`;

function likelyNeedsFreshWebData(text: string): boolean {
  return /\b(latest|today|current|recent|new|newest|update|updated|news|202[0-9]|law|policy|gdp|inflation|ceo|president|prime minister|market|stock|price|war|conflict)\b/i.test(text);
}

async function decideAskSearch(
  message: string,
  history: Array<{ role: string; content: string }>,
  provider: Provider,
  model: string
): Promise<{ shouldSearch: boolean; query: string }> {
  const context = history.slice(-4).map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt = `${context ? `Recent conversation:\n${context}\n\n` : ""}User message:\n${message}`;

  try {
    const decisionResult = await callAI(provider, model, ASK_SEARCH_DECISION_PROMPT, [{ role: "user", content: prompt }], 0);
    const decision = decisionResult.output;
    if (decision && typeof decision === "object") {
      const parsed = decision as { shouldSearch?: unknown; query?: unknown };
      const shouldSearch = Boolean(parsed.shouldSearch);
      const query = typeof parsed.query === "string" ? parsed.query.trim().slice(0, 240) : "";
      if (shouldSearch) {
        return { shouldSearch: true, query: query || message.slice(0, 240) };
      }
      return { shouldSearch: false, query: "" };
    }
  } catch (err) {
    console.warn("[ASK] Search decision failed:", err);
  }

  const fallbackShouldSearch = likelyNeedsFreshWebData(message);
  return {
    shouldSearch: fallbackShouldSearch,
    query: fallbackShouldSearch ? message.slice(0, 240) : "",
  };
}

async function generateFollowUpQueries(
  claim: string,
  currentResults: string,
  provider: Provider,
  model: string
): Promise<string[]> {
  const prompt = `Claim: "${claim}"\n\nCurrent search results:\n${currentResults.slice(0, 3000)}\n\nGenerate 2-3 specific follow-up queries to find more evidence.`;
  try {
    const result = await callAI(provider, model, QUERY_GENERATION_PROMPT, [{ role: "user", content: prompt }], 0.3);
    const parsed = typeof result.output === "object" && result.output !== null ? result.output : {};
    if (Array.isArray((parsed as { queries?: string[] }).queries)) {
      return (parsed as { queries: string[] }).queries.slice(0, 3);
    }
    return [];
  } catch (err) {
    console.warn("[DEEP RESEARCH] Failed to generate follow-up queries:", err);
    return [];
  }
}

async function deepResearchInner(
  claim: string,
  region: string,
  provider: Provider,
  model: string,
  options: ResearchOptions
): Promise<ResearchContext> {
  const context: ResearchContext = {
    searches: [],
    rankedResults: [],
    readContent: [],
    verifiedUrls: new Set(),
  };

  console.log(`[RESEARCH] Starting (mode: ${options.maxFollowUpQueries > 0 ? "deep" : "light"}) for: ${claim}`);

  const preferredSourceType = options.preferredSourceType || "any";
  const seedQueries = buildSearchQueries(claim, region, preferredSourceType, options.timeframe).slice(0, options.maxSeedQueries);
  const allResults: Array<ExaResult & { query: string }> = [];
  const matchesPreferredSourceType = (result: RankedSearchResult) => (
    preferredSourceType === "any" ||
    result.sourceType === preferredSourceType
  );

  const seedResults = await Promise.all(seedQueries.map(async (query) => {
    const results = await exaSearch(query);
    const ranked = rankSearchResults(results.map((result) => ({ ...result, query })), claim, preferredSourceType);
    const visibleRanked = preferredSourceType === "any" ? ranked : ranked.filter(matchesPreferredSourceType);
    context.searches.push({ query, results: formatRankedSearchResults(visibleRanked) });
    console.log(`[RESEARCH] Seed query "${query}": ${results.length} results`);
    return results.map((result) => ({ ...result, query }));
  }));
  seedResults.forEach((results) => allResults.push(...results));

  const initialRanked = rankSearchResults(allResults, claim, preferredSourceType);
  const initialText = formatRankedSearchResults(initialRanked.slice(0, 12));

  // Round 2: AI generates follow-up queries (skipped in light mode)
  if (options.maxFollowUpQueries > 0) {
    const followUpQueries = await generateFollowUpQueries(claim, initialText, provider, model);
    console.log(`[RESEARCH] Follow-up queries: ${followUpQueries.join(", ")}`);

    const followUpPromises = followUpQueries.slice(0, options.maxFollowUpQueries).map(async (query) => {
      const results = await exaSearch(query);
      const ranked = rankSearchResults(results.map((result) => ({ ...result, query })), claim, preferredSourceType);
      const visibleRanked = preferredSourceType === "any" ? ranked : ranked.filter(matchesPreferredSourceType);
      context.searches.push({ query, results: formatRankedSearchResults(visibleRanked) });
      allResults.push(...results.map((result) => ({ ...result, query })));
      return results.length;
    });
    await Promise.all(followUpPromises);
    console.log(`[RESEARCH] Round 2 complete, ${context.searches.length} total searches`);
  }

  context.rankedResults = rankSearchResults(allResults, claim, preferredSourceType);
  const readCandidates = preferredSourceType === "any"
    ? context.rankedResults
    : context.rankedResults.filter(matchesPreferredSourceType);
  const urlsToRead = readCandidates
    .filter((result) => result.qualityLabel !== "weak" || context.rankedResults.filter((r) => r.qualityLabel !== "weak").length < 2)
    .slice(0, options.maxUrlsToRead);

  const readPromises = urlsToRead.map(async (result) => {
    const url = result.url || "";
    const content = await exaGetContents(url);
    if (content) {
      context.readContent.push({ url, title: result.title || sourceTitleFromUrl(url), content, result });
      context.verifiedUrls.add(url);
    }
    return content.length > 0;
  });
  await Promise.all(readPromises);
  console.log(`[RESEARCH] Read ${context.readContent.length} pages`);

  return context;
}

// Wrapper with overall timeout - returns partial results if research exceeds time limit
async function deepResearch(
  claim: string,
  region: string,
  provider: Provider,
  model: string,
  options: ResearchOptions = DEEP_RESEARCH
): Promise<ResearchContext> {
  try {
    const result = await Promise.race([
      deepResearchInner(claim, region, provider, model, options),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Research timeout")), options.overallTimeoutMs)
      ),
    ]);
    return result;
  } catch (err) {
    console.warn(`[RESEARCH] Timed out or failed after ${options.overallTimeoutMs}ms:`, err);
    // Return empty context so the AI call still proceeds without research
    return { searches: [], rankedResults: [], readContent: [], verifiedUrls: new Set() };
  }
}

function buildResearchContext(research: ResearchContext): string {
  let ctx = "=== WEB RESEARCH RESULTS ===\n\n";
  ctx += "IMPORTANT: Only cite sources marked 'strong' or 'moderate'. Sources marked 'weak' are fallback context only, do NOT cite them as evidence. If only weak sources are available, state that evidence is limited.\n\n";

  // Add search results
  for (const search of research.searches) {
    ctx += `--- Search: "${search.query}" ---\n${search.results}\n\n`;
  }

  // Add full page content
  if (research.readContent.length > 0) {
    ctx += "\n=== FULL PAGE CONTENT (verified sources) ===\n\n";
    for (const page of research.readContent) {
      const quality = page.result ? `${page.result.sourceType}, ${page.result.qualityLabel}, ${page.result.qualityScore}/100` : "verified";
      const warning = page.result?.qualityLabel === "weak" ? " [WEAK, do not cite as evidence]" : "";
      ctx += `--- From: ${page.title} (${page.url}) ---\nSource quality: ${quality}${warning}\n${page.content.slice(0, 4000)}\n\n`;
    }
  }

  return ctx;
}

function getResearchSources(research: ResearchContext): ResearchSource[] {
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];

  for (const page of research.readContent) {
    if (!page.url || seen.has(page.url)) continue;
    if (page.result?.qualityLabel === "weak") continue; // Quality floor: weak sources can't be cited
    seen.add(page.url);
    const result = page.result;
    sources.push({
      title: page.title || result?.title || sourceTitleFromUrl(page.url),
      url: page.url,
      verified: research.verifiedUrls.has(page.url),
      sourceType: result?.sourceType || "generic",
      qualityScore: result?.qualityScore || 50,
      qualityLabel: result?.qualityLabel || "moderate",
    });
  }

  if (sources.length > 0) return sources.slice(0, 5);

  // Fallback: if no strong/moderate read content, use ranked results (excluding weak)
  for (const result of research.rankedResults) {
    const url = result.url || "";
    if (!url || seen.has(url)) continue;
    if (result.qualityLabel === "weak") continue;
    seen.add(url);
    sources.push({
      title: result.title || sourceTitleFromUrl(url),
      url,
      verified: false,
      sourceType: result.sourceType,
      qualityScore: result.qualityScore,
      qualityLabel: result.qualityLabel,
    });
    if (sources.length >= 5) return sources;
  }

  return sources;
}

function withResearchPreferences(base: ResearchOptions, preferences: Partial<ResearchOptions>): ResearchOptions {
  return { ...base, ...preferences };
}

function buildDiscoveredSources(research: ResearchContext) {
  return research.readContent.map((item) => ({
    title: item.title || sourceTitleFromUrl(item.url),
    url: item.url,
    content: item.content.slice(0, 1000),
    qualityScore: item.result?.qualityScore,
    sourceType: item.result?.sourceType,
    qualityLabel: item.result?.qualityLabel,
  }));
}

function enforceAttackControls(output: unknown, detectFallacies: boolean, analyzeWeighing: boolean) {
  if (!output || typeof output !== "object") return;
  const attackOutput = output as {
    fallaciesDetected?: unknown[];
    weighingAnalysis?: { currentWeighing?: string; missingComparisons?: string[]; improvementSuggestions?: string[] };
  };

  if (!detectFallacies) {
    attackOutput.fallaciesDetected = [];
  }
  if (!analyzeWeighing) {
    attackOutput.weighingAnalysis = {
      currentWeighing: "Weighing analysis was not requested.",
      missingComparisons: [],
      improvementSuggestions: [],
    };
  }
}

function enforceBrainstormControls(output: unknown, _side: string, outputMode: string) {
  if (!output || typeof output !== "object") return;
  const brainstormOutput = output as {
    topFive?: Array<{ idea?: { side?: string } }>;
    mindmap?: Array<{ items?: Array<{ side?: string }> }>;
    buckets?: Array<{ ideas?: Array<{ side?: string }> }>;
  };
  // The prompt already controls side. Post-filtering by side can erase useful
  // neutral or comparative ideas, so only enforce the requested output mode.

  if (outputMode !== "topfive") delete brainstormOutput.topFive;
  if (outputMode !== "mindmap") delete brainstormOutput.mindmap;
  if (outputMode !== "buckets") delete brainstormOutput.buckets;
}

function enforceGenerateControls(output: unknown, side: string, format: string, length: string, role: string) {
  if (!output || typeof output !== "object" || !("metadata" in output)) return;
  const generateOutput = output as {
    exordio?: unknown;
    contentions?: unknown[];
    metadata?: { side?: string; format?: string; generatedAt?: string };
  };
  if (!generateOutput.metadata) return;
  generateOutput.metadata.side = side === "con" ? "con" : "pro";
  generateOutput.metadata.format = format || "custom";
  if (role !== "intro" && "exordio" in generateOutput) {
    delete generateOutput.exordio;
  }
  if (Array.isArray(generateOutput.contentions)) {
    const target = length === "brief" ? 2 : length === "comprehensive" ? 4 : 3;
    generateOutput.contentions = generateOutput.contentions.slice(0, target);
  }
}

// ============== AI PROVIDER CALLS ==============

const HUMANIZER_INSTRUCTIONS = `HUMANIZER STYLE INSTRUCTIONS:
- Follow the local humanizer.md rules: remove obvious AI-writing patterns and make the prose sound human, specific, and natural.
- Write like a strong human debate coach, not a generic AI assistant. Be direct and concrete.
- Avoid inflated significance claims, promotional language, vague expert attributions, superficial "-ing" analysis, forced rule-of-three phrasing, synonym cycling, chatbot filler, and generic upbeat conclusions.
- Vary sentence rhythm where prose is requested, but keep structured JSON fields concise.
- Do not use em dashes at all. Use commas, colons, parentheses, or separate sentences instead.
- Do not write parameter labels inside argument prose, for example "Magnitude:", "Probability:", or "Timeframe:".
- When the user needs debate material, write lines that can be spoken in round, not table notes or rubric fragments.`;

function withHumanizerInstructions(systemPrompt: string): string {
  return `${systemPrompt}\n\n${HUMANIZER_INSTRUCTIONS}`;
}

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
  temperature: number
): Promise<AIResult> {
  try {
    return await callAIOnce(provider, model, systemPrompt, messages, temperature);
  } catch (err) {
    if (!(err instanceof InvalidJsonResponseError)) throw err;

    console.warn(`[AI] ${err.providerName} returned invalid JSON; retrying with repair prompt`);
    return await callAIOnce(
      provider,
      model,
      `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: Return only valid JSON matching this schema, no prose.`,
      withJsonRepairPrompt(messages),
      0
    );
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
  temperature: number
): Promise<AIResult> {
  const effectiveSystemPrompt = systemPrompt;
  if (provider === "openai") {
    return await callOpenAI([{ role: "system", content: effectiveSystemPrompt }, ...messages], model, temperature);
  } else if (provider === "anthropic") {
    return await callAnthropic(messages, model, temperature, effectiveSystemPrompt);
  } else if (provider === "google") {
    return await callGoogle(messages, model, temperature, effectiveSystemPrompt);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string, temperature: number): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, response_format: { type: "json_object" } }),
  }, 60000);
  if (!response.ok) { const text = await response.text(); throw new Error(`OpenAI error: ${text}`); }
  const data = await response.json();
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) throw new Error("OpenAI returned no choices");
  return {
    output: parseJsonFromText(data.choices[0]?.message?.content, "OpenAI"),
    usage: normalizeProviderUsage("openai", data.usage),
  };
}

async function callAnthropic(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string): Promise<AIResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, system, messages, max_tokens: 4096, temperature }),
  }, 60000);
  if (!response.ok) { const text = await response.text(); throw new Error(`Anthropic error: ${text}`); }
  const data = await response.json();
  if (!data?.content || !Array.isArray(data.content) || data.content.length === 0) throw new Error("Anthropic returned no content");
  return {
    output: parseJsonFromText(data.content[0]?.text || "", "Anthropic"),
    usage: normalizeProviderUsage("anthropic", data.usage),
  };
}

async function callGoogle(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string): Promise<AIResult> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const payload = { contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature, responseMimeType: "application/json" } };
  const response = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 60000);
  if (!response.ok) { const text = await response.text(); throw new Error(`Google error: ${text}`); }
  const data = await response.json();
  if (!data?.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) throw new Error("Google returned no candidates");
  return {
    output: parseJsonFromText(data.candidates[0]?.content?.parts?.[0]?.text || "", "Google"),
    usage: normalizeProviderUsage("google", data.usageMetadata),
  };
}

function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []).map((url) => url.replace(/[),.;!?]+$/g, ""));
}

// ============== PROMPTS ==============

// Dynamic date context for prompts - ensures AI knows the current year
function getCurrentDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  return `CURRENT DATE: ${now.toLocaleDateString('en-US', options)} (${now.getFullYear()})`;
}

const GENERATE_PROMPT = `You are an experienced competitive debater and coach with years of tournament experience. Generate a tournament-ready debate case in JSON format.

[DATE_CONTEXT]

CRITICAL CONTEXT: You have been provided with WEB RESEARCH RESULTS containing current real-world data, statistics, and sources. This research reflects the CURRENT state of affairs. USE THIS DATA as your primary source of truth - do not rely on outdated training data. Prioritize evidence from 2025-2026.

=== DEBATE FORMAT (4-6-6-3) ===

This is a 4-speaker team debate format. Each speaker has a distinct job:

--- INTRODUCTOR (4 minutes) ---
The Introductor sets the entire narrative. Their job:
1. EXORDIO: Open with a compelling hook, a real-world anecdote, startling statistic, powerful rhetorical question, or vivid scenario. This is NOT optional. Every good Introductor opens with an exordio that grabs the judge's attention. Then bridge smoothly into the topic.
2. DEFINITIONS: Define key terms strategically (not dictionary definitions, frame them to favor your side).
3. FRAMEWORK: Establish the evaluative lens (utilitarian, rights-based, pragmatic, etc.).
4. THESIS: State your team's central claim clearly and memorably.
5. ARGUMENT ROADMAP: Preview the structure, "Our team will show three things..."
The Introductor does NOT present full arguments, they set up the battlefield.

--- R1 - First Speaker (6 minutes) ---
R1 is the workhorse. Their job:
- 4 minutes CONSTRUCTIVE: Build 2-3 core arguments with full warrant chains. Each argument needs: claim → reasoning → evidence → impact. Go DEEP, not wide. Every link in the chain must be airtight.
- 2 minutes REBUTTAL: Anticipate and preemptively address the strongest opponent arguments. Use turns, mitigations, and no-link responses.
R1 provides the substance. They make the team's case undeniable with concrete evidence and tight logic.

--- R2 - Second Speaker (6 minutes) ---
R2 is the strategist. Their job:
- EXTEND R1's arguments: Don't just repeat, deepen. Add new evidence, new warranting, responses to likely attacks on R1's case.
- CLASH: Directly engage with opponent arguments. Identify the central disagreements and explain why your side wins each clash.
- WEIGHING: Compare impacts. Use magnitude, probability, and timeframe to show why your harms/benefits matter more.
R2 wins the debate by controlling the narrative and winning the key clashes.

--- CONCLUSOR (3 minutes) ---
The Conclusor crystallizes. Their job:
- NO NEW ARGUMENTS: Only synthesize and weigh what's already been said.
- KEY CLASHES: Identify the 2-3 most important disagreements in the round and explain why your side wins each one.
- WEIGHING: Even if the opponent is partially right, explain why your side still wins on balance.
- STRONG CLOSE: End with a powerful, memorable statement that ties back to the exordio or thesis.
The Conclusor is the last voice the judge hears. Make it count.

=== WRITING STYLE, Sound like a REAL debater ===

DO:
- Use debate terminology naturally: "weighing", "impacts", "links", "warrants", "brightlines", "uniqueness", "magnitude", "probability", "timeframe", "turns", "mitigations"
- Write arguments as you would speak them in round, confident, persuasive, conversational
- Vary sentence length. Mix short punchy sentences with longer analytical ones.
- Use rhetorical questions: "What happens when we ignore this?"
- Use transitions that sound human: "Look, here's the thing...", "What does this mean in practice?", "And this is where it gets interesting..."
- Be assertive: "This matters because..." not "One might argue that..."
- Use analogies and vivid examples that make abstract points concrete

DO NOT:
- Say "It is important to note" or "It should be noted"
- Say "Furthermore" or "Moreover" or "Additionally" as paragraph starters
- Say "In conclusion" or "To summarize"
- Say "This demonstrates that" or "This clearly shows"
- Say "One could argue" or "It could be said"
- Say "It is worth mentioning" or "It is crucial to understand"
- Use any robotic AI filler phrases. If it sounds like a Wikipedia article, rewrite it.
- Start every sentence with "The", vary your sentence openings

=== JSON SCHEMA ===

The output MUST include the "exordio" field when the role is "intro". For other roles, omit "exordio".

{
  "exordio": {
    "hook": "A compelling opening, anecdote, startling statistic, rhetorical question, or vivid scenario that grabs attention. Should be 2-4 sentences. Make it vivid and specific, not generic.",
    "transition": "A smooth 1-2 sentence bridge from the hook into the topic and your team's position."
  },
  "caseStructure": {
    "thesis": "A punchy, memorable thesis statement",
    "framework": "The lens/value through which to evaluate this debate",
    "keyDefinitions": ["definition1", "definition2"],
    "burdenOfProof": "Our burden - what we must prove to win the ballot"
  },
  "contentions": [
    {
      "id": "1",
      "claim": "Clear, tagline-style claim",
      "reasoning": "The warrant - WHY this claim is true. Provide 2-3 logical links with clear causation chains.",
      "evidence": "Specific stats, studies, expert quotes FROM THE PROVIDED RESEARCH. Cite sources with dates.",
      "needsSource": false,
      "sourceQuery": "",
      "impact": "A cohesive, speech-ready impact paragraph. Explain why the judge should care using magnitude, probability, and timeframe naturally, but never label them as separate parameters."
    }
  ],
  "predictedOpponentCase": {
    "likelyArguments": ["5-8 arguments they will run"],
    "strategicWeaknesses": ["Honest assessment of our vulnerabilities"],
    "keyClashes": ["Where the debate will be won or lost"]
  },
  "counters": [
    {
      "targetArgument": "Their argument",
      "counterpoint": "Our response - turn, mitigate, or take out",
      "rebuttal": "How to phrase this in round"
    }
  ],
  "metadata": {
    "side": "pro",
    "format": "custom",
    "generatedAt": "CURRENT_ISO_TIMESTAMP"
  }
}

ROLE-SPECIFIC OUTPUT GUIDELINES:
- "intro": MUST include "exordio" with hook and transition. Contentions should be high-level roadmap points (lighter on evidence, heavier on framing). Include 2-3 contentions as previews.
- "r1": Omit "exordio". Provide 2-3 DEEP contentions with extensive evidence and warrants. Counters should be preemptive rebuttals.
- "r2": Omit "exordio". Contentions should be extensions + clash responses. Focus predictedOpponentCase and counters heavily on weighing analysis.
- "conc": Omit "exordio". Provide 2-3 contentions framed as crystallization points ("Even if they prove X, we still win because Y"). Counters should be final-round weighing responses.

REQUIREMENTS:
1. Side must be exactly "pro" or "con".
2. Generate contentions appropriate to the role (see above).
3. Include 5-8 predicted opponent arguments with pre-written counters.
4. USE THE WEB RESEARCH - cite real 2025-2026 statistics and sources.
5. ALWAYS set needsSource to false.
6. Write the ENTIRE output in the language specified by the user. All arguments, evidence, descriptions, and analysis must be in that language.
7. Every contention should read like something a debater can actually say in a speech. Do not output table-like notes or field labels inside prose.`;

const ATTACK_PROMPT = `You are a ruthless, experienced competitive debater tasked with tearing apart an opponent's case. Analyze this case like you're prepping to destroy it in finals.

[DATE_CONTEXT]

CRITICAL: You have WEB RESEARCH with current 2025-2026 data. Use this to:
- Fact-check their claims against current reality
- Find counter-evidence and turns
- Identify where their evidence is outdated or misrepresented

DEBATE FORMAT:
- Introductor (4 min): Intro + argument roadmap
- R1 (6 min): 4 min constructive, 2 min rebuttal
- R2 (6 min): Extensions + clash
- Conclusor (3 min): Weighing + crystallization

ATTACK VOCABULARY - Think like a debater:
- "Turn" = their argument actually helps our side
- "Mitigate" = reduce the impact/probability of their claim
- "No link" = their causation chain is broken
- "Non-unique" = the harm exists regardless of the motion
- "Timeframe/Probability/Magnitude" = weighing metrics
- "Assertion without warrant" = they said it but didn't prove it

Be BRUTAL but substantive. Don't just say "this is weak" - explain exactly how to exploit it.

Return JSON:
{
  "overallAssessment": { "score": 0-100, "summary": "Honest assessment", "strengthAreas": ["What they did right"] },
  "weaknesses": [{ "id": "string", "severity": "critical|major|minor", "type": "evidential|logical|structural", "description": "The flaw", "whyWeak": "Why this matters", "howOpponentAttacks": "Exact words to say in round", "improvedVersion": "How to fix it", "affectedQuote": "The problematic text" }],
  "fallaciesDetected": [{ "name": "Fallacy name", "location": "Where in case", "explanation": "How to call it out" }],
  "crossExQuestions": [{ "question": "The trap question", "purpose": "What you're setting up", "expectedTrap": "How their answer hurts them" }],
  "weighingAnalysis": { "currentWeighing": "Their weighing", "missingComparisons": ["What they didn't compare"], "improvementSuggestions": ["How to out-weigh them"] }
}`;

const BRAINSTORM_PROMPT = `You're in the prep room with your team before a tournament round. Brainstorm arguments like experienced competitive debaters.

[DATE_CONTEXT]

CRITICAL: You have WEB RESEARCH with current 2025-2026 data. Use this to:
- Ground your ideas in current events and recent developments
- Find unexpected angles backed by real-world evidence
- Identify what arguments are "hot" in current discourse

DEBATE FORMAT:
- Introductor (4 min) → R1 (6 min) → R2 (6 min) → Conclusor (3 min)

BRAINSTORM LIKE A DEBATER:
- Think about "what's the narrative?" and "what's the mechanism?"
- Consider stakeholder analysis: who wins, who loses, who decides?
- Look for "intuition pumps" - examples that make the argument click
- Identify potential "turns" - where an argument could backfire
- Think about strategic positioning: what arguments force good clashes?

Idea object structure:
{
  "id": "unique-string-id",
  "title": "Punchy argument tagline",
  "description": "The argument angle with warrant and potential evidence",
  "side": "pro" | "con" | "neutral",
  "strength": "strong" | "moderate" | "weak",
  "tradeoffs": ["potential downside", "how opponent might flip this"],
  "relatedTo": ["id-of-related-idea"]
}

For outputMode "topfive":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "topFive": [
    { "rank": 1, "idea": { /* Idea */ }, "whyTop": "Why this wins rounds" }
  ],
  "nextSteps": ["Research to do", "Arguments to prep"],
  "warningsAndTradeoffs": ["Watch out for..."]
}

For outputMode "mindmap":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "mindmap": [
    { "category": "Economic/Social/Political/Practical/Principled", "items": [/* Idea objects */] }
  ],
  "nextSteps": [...],
  "warningsAndTradeoffs": [...]
}

For outputMode "buckets":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "buckets": [
    { "name": "Slam Dunks/High Risk High Reward/Defensive/Creative", "ideas": [...], "keyInsight": "Strategic note" }
  ],
  "nextSteps": [...],
  "warningsAndTradeoffs": [...]
}

If motion is unclear: { "needsMoreInfo": true, "clarifyingQuestions": [...], "nextSteps": [], "warningsAndTradeoffs": [] }

Generate 3-5 debate-ready ideas with real strategic value.`;

const FACTOIDS_PROMPT = `You are a debate research specialist helping a team find cuttable evidence for tournament prep.

[DATE_CONTEXT]

CRITICAL: You have DEEP RESEARCH with 2025-2026 web search results and verified source content. PRIORITIZE RECENT DATA:
- 2026 data is gold - use it
- 2025 data is great
- Pre-2024 data should only be used for historical context or if it's the definitive study

EVIDENCE QUALITY STANDARDS:
- Quantify whenever possible: percentages, dollar amounts, dates, sample sizes
- Note source credibility: peer-reviewed > government > news > think tank > blog
- Flag potential bias in sources
- Explain methodology limitations
- Respect the requested source type exactly. If academic is requested, use scholarly or peer-reviewed sources only. If government is requested, use official government or intergovernmental sources only. If news is requested, use established news sources only.
- Return only verified sources with exact URLs from the research context. Do not include pending or unverified citations.
- Return the requested number of sources unless fewer verified matching sources exist.

For each factoid, think about:
- How would a debater card this? (short claim + key stat)
- When in a round would you use this? (constructive vs rebuttal)
- What's the strongest way to frame this stat?

Output JSON:
{
  "factoids": [{ 
    "id": "string", 
    "shortClaim": "One-sentence claim suitable for a card tagline", 
    "keyFigure": "The stat/number that makes this evidence powerful", 
    "context": "Methodology, sample size, conditions - what makes this credible", 
    "limitations": "Honest limitations debaters should know", 
    "citation": { 
      "title": "Article/study title", 
      "publisher": "Organization/journal", 
      "date": "Publication date (PRIORITIZE 2025-2026)", 
      "url": "EXACT URL from research context", 
      "verified": "verified|unverified" 
    }, 
    "howToUse": "When and how to deploy this in a round", 
    "relevanceScore": 0-100 
  }],
  "searchSuggestions": ["Follow-up research queries"], 
  "warnings": ["Red flags or limitations to note"], 
  "researchSummary": "What the research found overall",
  "verificationStatus": "complete"
}`;

const ASK_PROMPT = `You are a debate coach chat bot. Answer the user's question.

[DATE_CONTEXT]

Output JSON matching:
{
  "response": "string (markdown supported)",
  "citations": [{ "claim": "string", "source": "string", "verified": boolean, "note": "string" }],
  "searchInfo": { "webSearchUsed": boolean, "queries": ["string"], "sources": [{ "title": "string", "url": "string", "verified": boolean }] },
  "followUpQuestions": ["string"],
  "uncertainties": ["string"],
  "prosConsAnalysis": { "pros": ["string"], "cons": ["string"] },
  "argumentMap": { "mainClaim": "string", "supportingPoints": ["string"], "counterpoints": ["string"], "assumptions": ["string"] }
}

Rules:
- Always return valid JSON with response, followUpQuestions, and uncertainties.
- If Pros/Cons is ON, include prosConsAnalysis with useful entries. If it is OFF, omit prosConsAnalysis.
- If Argument Map is ON, include argumentMap with useful entries. If it is OFF, omit argumentMap.
- If Mode is clarify, make the response explain the unclear parts and include follow-up questions that would resolve ambiguity.
- If Citation Mode is ON, include citations for factual claims when WEB RESEARCH RESULTS or WEB PAGE CONTEXT provide sources. Use exact URLs when available.
- Do not invent citations. If no source is available, set citations to [] and add that limitation to uncertainties.
- If Citation Mode is OFF, set citations to [] unless the user explicitly asks for sources.
- The server fills searchInfo after your response.`;

async function buildSystemPrompt(feature: Feature, customSystemPrompt?: string | null, sources?: Source[]): Promise<string> {
  let base = feature === "generate" ? GENERATE_PROMPT : feature === "attack" ? ATTACK_PROMPT : feature === "brainstorm" ? BRAINSTORM_PROMPT : feature === "factoids" ? FACTOIDS_PROMPT : ASK_PROMPT;

  // Inject current date context for features with web research
  const webResearchFeatures: Feature[] = ["generate", "attack", "brainstorm", "factoids", "ask"];
  if (webResearchFeatures.includes(feature)) {
    base = base.replace("[DATE_CONTEXT]", getCurrentDateContext());
  }

  // Fetch global prompt from database (admin-configured)
  const globalPrompt = await getGlobalPrompt(feature);
  const globalSection = globalPrompt ? `\n\nADMIN-CONFIGURED INSTRUCTIONS:\n${globalPrompt}` : "";

  // User's custom prompt (from their settings)
  const custom = customSystemPrompt ? `\n\nCUSTOM SYSTEM PROMPT:\n${customSystemPrompt}` : "";

  const sourceText = sources && sources.length ? `\n\nLOCAL KNOWLEDGE BASE (use as primary factual source):\n${sources.map((s) => `--- ${s.title} (${s.origin || s.type}) ---\n${s.content}\n`).join("\n")}` : "";
  return withHumanizerInstructions(`${base}${globalSection}${custom}${sourceText}`);
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
  // Check rate limits (includes subscription gating and model access)
  const rateLimit = await checkRateLimit(userId, model);
  if (!rateLimit.allowed) {
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
  try {
    const systemPrompt = await buildSystemPrompt(feature, customSystemPrompt, sources);

    // FACTOIDS: Use deep research with multiple searches
    if (feature === "factoids") {
      const claim = String(sanitizedInput.claim || "");
      const region = String(sanitizedInput.region || "Global");
      const preferredSourceType = String(sanitizedInput.sourceType || "any");
      const timeframe = String(sanitizedInput.timeframe || "");
      const sourceCount = Math.min(15, Math.max(3, Number(sanitizedInput.sourceCount || 5)));

      // Perform deep research with multiple search rounds
      const research = await deepResearch(claim, region, provider, model, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType,
        timeframe,
      }));
      const searchContext = buildResearchContext(research);

      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];

      const aiResult = await callAI(provider, model, systemPrompt, messages, temperature);
      const output = cleanGeneratedText(aiResult.output);

      // Post-process: verify URLs in the response
      if (output && typeof output === "object" && "factoids" in output) {
        const factoids = (output as { factoids: Array<{ citation: { url: string; verified: string } }> }).factoids;
        const verifyPromises = factoids.map(async (f) => {
          if (f.citation?.url && research.verifiedUrls.has(f.citation.url)) {
            f.citation.verified = "verified";
          } else if (f.citation?.url) {
            const isValid = await verifyUrl(f.citation.url);
            f.citation.verified = isValid ? "verified" : "unverified";
          }
        });
        await Promise.all(verifyPromises);
        (output as { factoids: Array<{ citation: { verified: string } }>; verificationStatus?: string }).factoids = factoids
          .filter((f) => f.citation?.verified === "verified")
          .slice(0, sourceCount);
        (output as { verificationStatus?: string }).verificationStatus = "complete";
      }

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
      await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
      return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          const content = await exaGetContents(u);
          return `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`;
        }));
        urlContext = "\n\nWEB PAGE CONTEXT:\n" + contents.join("\n");
      }

      // 2) Optional web search in Ask mode. When the user explicitly enables
      // web search or citations, perform research instead of leaving it to the model.
      let webSearchContext = "";
      if (shouldUseResearch) {
        const searchDecision = await decideAskSearch(message, history, provider, model);
        askSearchQuery = searchDecision.query || message.slice(0, 240);
        if (askSearchQuery) {
          askResearch = await deepResearch(askSearchQuery, "", provider, model, ASK_RESEARCH);
          if (askResearch.searches.length > 0 || askResearch.readContent.length > 0) {
            webSearchContext = `\n\n${buildResearchContext(askResearch)}`;
          }
        }
      }

      const modeGuidance = getAskModeGuidance(mode);
      const basePrompt = `Message: ${message}
Mode: ${mode}
Mode Guidance: ${modeGuidance}
Citation Mode: ${citationMode ? "ON - cite sourced factual claims using the research or page context below" : "OFF"}
Web Search: ${webSearchEnabled ? "ENABLED" : "DISABLED"}
Pros/Cons: ${prosConsMode ? "ON - include prosConsAnalysis" : "OFF - omit prosConsAnalysis"}
Argument Map: ${argumentMapMode ? "ON - include argumentMap" : "OFF - omit argumentMap"}
Research Context: ${webSearchContext || urlContext ? "AVAILABLE" : "NONE"}`;
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
      const aiResult = await callAI(provider, model, systemPrompt, messages, temperature);
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
        if (!citationMode) {
          typedOutput.citations = [];
        }
        if (!prosConsMode) {
          delete (typedOutput as { prosConsAnalysis?: unknown }).prosConsAnalysis;
        }
        if (!argumentMapMode) {
          delete (typedOutput as { argumentMap?: unknown }).argumentMap;
        }
      }

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
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
      const research = await deepResearch(motion, "", provider, model, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType: "any",
      }));
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = await callAI(provider, model, systemPrompt, messages, temperature);
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
      await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // BRAINSTORM: Use research to inform argument angles
    if (feature === "brainstorm") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "both");
      const outputMode = String(sanitizedInput.outputMode || "topfive");

      // Perform deep research to find relevant context
      console.log("[BRAINSTORM] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = await callAI(provider, model, systemPrompt, messages, temperature);
      const output = cleanGeneratedText(aiResult.output);
      enforceBrainstormControls(output, side, outputMode);

      // Build discovered sources from research
      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[BRAINSTORM] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ATTACK: Use deep research for evidence-based critique
    if (feature === "attack") {
      const caseText = String(sanitizedInput.caseText || "");
      const detectFallacies = typeof sanitizedInput.detectFallacies === "boolean" ? sanitizedInput.detectFallacies : true;
      const analyzeWeighing = typeof sanitizedInput.analyzeWeighing === "boolean" ? sanitizedInput.analyzeWeighing : true;

      // Research the topic to find counter-evidence
      console.log("[ATTACK] Starting deep research for case analysis");
      const research = await deepResearch(caseText.slice(0, 500), "", provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = await callAI(provider, model, systemPrompt, messages, temperature);
      const output = cleanGeneratedText(aiResult.output);
      enforceAttackControls(output, detectFallacies, analyzeWeighing);

      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[ATTACK] Found ${discoveredSources.length} sources`);

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback for any other feature
    const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
    const messages = [{ role: "user", content: userPrompt }];
    const fallbackResult = await callAI(provider, model, systemPrompt, messages, temperature);
    const output = cleanGeneratedText(fallbackResult.output);

    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, fallbackResult.usage, latencyMs);
    return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERROR]", message);

    // Log error
    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, undefined, latencyMs, "error", message.slice(0, 100));
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
