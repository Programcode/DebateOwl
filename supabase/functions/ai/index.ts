// Supabase Edge Function: AI proxy for DebateLab
// Keeps provider keys server-side and returns structured JSON.

// Inline CORS headers to avoid import issues
// SECURITY: Using production domain. Localhost calls from dev browser work because 
// browsers accept specific origin even when request is from different origin.
// SECURITY: Allow specific origins for CORS
const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:5173",
  "http://127.0.0.1:54321" // Local Supabase
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
const corsHeaders = getCorsHeaders(null); // Default for non-request contexts

type Provider = "openai" | "anthropic" | "google";

type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask";

type Source = {
  title: string;
  content: string;
  origin?: string;
  type: string;
};

type JinaResult = { title?: string; url?: string; content?: string; description?: string };

interface ResearchContext {
  searches: Array<{ query: string; results: string }>;
  readContent: Array<{ url: string; content: string }>;
  verifiedUrls: Set<string>;
}

interface ResearchOptions {
  maxFollowUpQueries: number; // 0 = skip AI follow-up entirely
  maxUrlsToRead: number;      // How many pages to read in full
  overallTimeoutMs: number;   // Hard timeout for entire research
}

const DEEP_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 3,
  maxUrlsToRead: 5,
  overallTimeoutMs: 45000,
};

const ASK_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 1,
  maxUrlsToRead: 3,
  overallTimeoutMs: 25000,
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

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============== RATE LIMITING & SUBSCRIPTION GATING ==============

// Pro-only models: require active subscription
const PRO_MODELS = new Set([
  "gpt-4o",
  "claude-3-5-sonnet-latest",
  "claude-3-opus-20240229",
  "gemini-1.5-pro",
  "gemini-2.0-pro-exp",
  "gemini-3-pro-preview",
]);

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

  if (!user) {
    // No settings row — treat as new trial user
    return { tier: "trial", dailyLimit: 5, canAccessProModels: false, trialEndsAt: null, gracePeriodEndsAt: null };
  }

  const tier = user.subscription_tier || "trial";
  const now = new Date();

  // Legacy free users in grace period get pro-level access
  if (tier === "legacy_free") {
    const graceEnd = user.grace_period_ends_at ? new Date(user.grace_period_ends_at) : null;
    if (graceEnd && now < graceEnd) {
      const limit = user.daily_limit_override ? Math.max(50, user.daily_limit_override) : 50;
      return { tier: "legacy_free", dailyLimit: limit, canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }
    // Grace period expired — treat as expired
    return { tier: "expired", dailyLimit: user.daily_limit_override || 0, canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
  }

  // Pro subscribers
  if (tier === "pro") {
    const limit = user.daily_limit_override ? Math.max(50, user.daily_limit_override) : 50;
    return { tier: "pro", dailyLimit: limit, canAccessProModels: true, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
  }

  // Trial users
  if (tier === "trial") {
    const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
    if (trialEnd && now < trialEnd) {
      const limit = user.daily_limit_override ? Math.max(5, user.daily_limit_override) : 5;
      return { tier: "trial", dailyLimit: limit, canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
    }
    // Trial expired
    return { tier: "expired", dailyLimit: user.daily_limit_override || 0, canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
  }

  // Expired
  return { tier: "expired", dailyLimit: user.daily_limit_override || 0, canAccessProModels: false, trialEndsAt: user.trial_ends_at, gracePeriodEndsAt: user.grace_period_ends_at };
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

    // Check if trial/access expired (limit = 0)
    if (sub.tier === "expired" && sub.dailyLimit === 0) {
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

    // Count today's requests (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
      .from("ai_requests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString());

    if (countError) {
      console.warn("[RATE LIMIT] Error counting requests:", countError);
      return { allowed: true }; // Fail open
    }

    const currentCount = count || 0;

    // Check against subscription limit
    if (sub.dailyLimit > 0 && currentCount >= sub.dailyLimit) {
      return {
        allowed: false,
        reason: `You've used all ${sub.dailyLimit} of your daily requests. ${sub.tier === "pro" ? "Limit resets at midnight UTC." : "Upgrade to Pro for 50 daily requests."}`,
        code: "limit_reached",
        limit: sub.dailyLimit,
        current: currentCount,
        statusCode: 402,
      };
    }

    return { allowed: true, limit: sub.dailyLimit, current: currentCount };
  } catch (err) {
    console.warn("[RATE LIMIT] Check failed:", err);
    return { allowed: true }; // Fail open
  }
}

async function logUsage(
  userId: string | null,
  feature: string,
  provider: string,
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  latencyMs?: number,
  status: string = "success",
  errorCode?: string
) {
  try {
    // Estimate cost (rough estimates per 1M tokens)
    const costPer1MInput: Record<string, number> = {
      "gpt-4o": 2.5, "gpt-4o-mini": 0.15, "gpt-4-turbo": 10,
      "gemini-2.0-flash": 0.075, "gemini-1.5-pro": 1.25,
      "claude-3-5-sonnet": 3, "claude-3-haiku": 0.25
    };
    const costPer1MOutput: Record<string, number> = {
      "gpt-4o": 10, "gpt-4o-mini": 0.6, "gpt-4-turbo": 30,
      "gemini-2.0-flash": 0.3, "gemini-1.5-pro": 5,
      "claude-3-5-sonnet": 15, "claude-3-haiku": 1.25
    };

    const inputCost = ((inputTokens || 0) / 1_000_000) * (costPer1MInput[model] || 1);
    const outputCost = ((outputTokens || 0) / 1_000_000) * (costPer1MOutput[model] || 4);
    const totalCost = inputCost + outputCost;

    await supabase.from("ai_requests").insert({
      user_id: userId,
      feature,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      status,
      error_code: errorCode,
      cost_usd: totalCost > 0 ? totalCost : null
    });
  } catch (err) {
    console.warn("[USAGE LOG] Failed to log:", err);
  }
}

const DEFAULT_PROVIDER = (Deno.env.get("AI_DEFAULT_PROVIDER") || "google") as Provider;

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_INPUT_LENGTH = 50000;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|text)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*:\s*\[/i,
  /\[\s*SYSTEM\s*\]/i,
  /\{\s*"role"\s*:\s*"system"/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*instruction/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
];

function sanitizePromptInput(input: string, fieldName: string): { sanitized: string } | { rejected: string } {
  if (typeof input !== "string") return { sanitized: "" };
  // eslint-disable-next-line no-control-regex
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[SECURITY] Prompt injection attempt detected in ${fieldName}: ${sanitized.slice(0, 200)}`);
      return { rejected: `Suspicious content detected in ${fieldName}` };
    }
  }
  if (sanitized.length > MAX_INPUT_LENGTH) {
    console.warn(`[SECURITY] Input truncated in ${fieldName}: ${sanitized.length} chars -> ${MAX_INPUT_LENGTH}`);
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }
  return { sanitized };
}

function sanitizeInput(input: Record<string, unknown>): { sanitized: Record<string, unknown> } | { rejected: string } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const sanitizeResult = sanitizePromptInput(value, key);
      if ("rejected" in sanitizeResult) return sanitizeResult;
      result[key] = sanitizeResult.sanitized;
    } else if (Array.isArray(value)) {
      const sanitizedArray: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "object" && item !== null && "content" in item) {
          const contentResult = sanitizePromptInput(String((item as Record<string, unknown>).content || ""), `${key}[${i}].content`);
          if ("rejected" in contentResult) return contentResult;
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
  return { sanitized: result };
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
  throw new Error(`${providerName} returned invalid JSON`);
}

// ============== JINA FUNCTIONS ==============

async function jinaSearch(query: string): Promise<JinaResult[]> {
  const apiKey = Deno.env.get("JINA_API_KEY");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetchWithTimeout(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers }, 30000);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data?.data || !Array.isArray(data.data)) return [];
    return data.data as JinaResult[];
  } catch {
    console.warn(`[JINA] Search failed for: ${query}`);
    return [];
  }
}

async function jinaRead(url: string): Promise<string> {
  const apiKey = Deno.env.get("JINA_API_KEY");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, { headers }, 30000);
    if (!response.ok) return "";
    const data = await response.json();
    return (data.data?.content || data.content || "").slice(0, 8000);
  } catch {
    console.warn(`[JINA] Read failed for: ${url}`);
    return "";
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    return response.ok;
  } catch {
    return false;
  }
}

function formatSearchResults(results: JinaResult[]): string {
  return results.map((r) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content || r.description}\n---`).join("\n");
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
    const decision = await callAI(provider, model, ASK_SEARCH_DECISION_PROMPT, [{ role: "user", content: prompt }], 0);
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
    const parsed = typeof result === "object" && result !== null ? result : {};
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
    readContent: [],
    verifiedUrls: new Set(),
  };

  console.log(`[RESEARCH] Starting (mode: ${options.maxFollowUpQueries > 0 ? "deep" : "light"}) for: ${claim}`);

  // Round 1: Initial search
  const initialQuery = `${claim} ${region} statistics data`.trim();
  const round1Results = await jinaSearch(initialQuery);
  const round1Text = formatSearchResults(round1Results);
  context.searches.push({ query: initialQuery, results: round1Text });
  console.log(`[RESEARCH] Round 1: ${round1Results.length} results`);

  // Extract URLs for reading
  const urlsToRead = round1Results.slice(0, 3).map((r) => r.url).filter(Boolean) as string[];

  // Round 2: AI generates follow-up queries (skipped in light mode)
  if (options.maxFollowUpQueries > 0) {
    const followUpQueries = await generateFollowUpQueries(claim, round1Text, provider, model);
    console.log(`[RESEARCH] Follow-up queries: ${followUpQueries.join(", ")}`);

    const followUpPromises = followUpQueries.slice(0, options.maxFollowUpQueries).map(async (query) => {
      const results = await jinaSearch(query);
      const text = formatSearchResults(results);
      context.searches.push({ query, results: text });
      results.slice(0, 2).forEach((r) => {
        if (r.url && !urlsToRead.includes(r.url)) urlsToRead.push(r.url);
      });
      return results.length;
    });
    await Promise.all(followUpPromises);
    console.log(`[RESEARCH] Round 2 complete, ${context.searches.length} total searches`);
  }

  // Round 3: Read top URLs for full content
  const readPromises = urlsToRead.slice(0, options.maxUrlsToRead).map(async (url) => {
    const content = await jinaRead(url);
    if (content) {
      context.readContent.push({ url, content });
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
    return { searches: [], readContent: [], verifiedUrls: new Set() };
  }
}

function buildResearchContext(research: ResearchContext): string {
  let ctx = "=== WEB RESEARCH RESULTS ===\n\n";

  // Add search results
  for (const search of research.searches) {
    ctx += `--- Search: "${search.query}" ---\n${search.results}\n\n`;
  }

  // Add full page content
  if (research.readContent.length > 0) {
    ctx += "\n=== FULL PAGE CONTENT (verified sources) ===\n\n";
    for (const page of research.readContent) {
      ctx += `--- From: ${page.url} ---\n${page.content.slice(0, 4000)}\n\n`;
    }
  }

  return ctx;
}

// ============== AI PROVIDER CALLS ==============

async function callAI(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number
): Promise<unknown> {
  if (provider === "openai") {
    return await callOpenAI([{ role: "system", content: systemPrompt }, ...messages], model, temperature);
  } else if (provider === "anthropic") {
    return await callAnthropic(messages, model, temperature, systemPrompt);
  } else if (provider === "google") {
    return await callGoogle(messages, model, temperature, systemPrompt);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string, temperature: number) {
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
  return parseJsonFromText(data.choices[0]?.message?.content, "OpenAI");
}

async function callAnthropic(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string) {
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
  return parseJsonFromText(data.content[0]?.text || "", "Anthropic");
}

async function callGoogle(messages: Array<{ role: string; content: string }>, model: string, temperature: number, system: string) {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const payload = { contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature, responseMimeType: "application/json" } };
  const response = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 60000);
  if (!response.ok) { const text = await response.text(); throw new Error(`Google error: ${text}`); }
  const data = await response.json();
  if (!data?.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) throw new Error("Google returned no candidates");
  return parseJsonFromText(data.candidates[0]?.content?.parts?.[0]?.text || "", "Google");
}

function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
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

DEBATE FORMAT:
- Introductor (4 min): Sets up the debate, defines key terms, presents the team line and argument roadmap.
- R1 (6 min): 4 min constructive (building arguments with warrants and impacts), 2 min rebuttal.
- R2 (6 min): Extends R1's arguments, primarily focuses on clash and weighing.
- Conclusor (3 min): Crystallizes the debate, weighs key clashes, explains why this side wins.

WRITING STYLE - Sound like a real debater:
- Use debate terminology naturally: "weighing", "impacts", "links", "warrants", "brightlines", "uniqueness", "magnitude", "probability", "timeframe"
- Write arguments as you would speak them in round - confident, persuasive, human
- Avoid robotic AI-speak. No "it is important to note" or "this demonstrates that"
- Be assertive: "This matters because..." not "One might argue that..."

STRICT JSON SCHEMA:
{
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
      "impact": "The SO WHAT - magnitude, probability, and timeframe of the harm/benefit"
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

REQUIREMENTS:
1. Side must be exactly "pro" or "con".
2. Generate 3-4 strong contentions with thorough warrants.
3. Include 5-8 predicted opponent arguments with pre-written counters.
4. USE THE WEB RESEARCH - cite real 2025-2026 statistics and sources.
5. ALWAYS set needsSource to false.`;

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

Output JSON matching:
{ "response": "string (markdown supported)", "followUpQuestions": ["string"], "uncertainties": ["string"], "prosConsAnalysis": { "pros": [...], "cons": [...] }, "argumentMap": { "mainClaim": "string", "supportingPoints": [...], "counterpoints": [...], "assumptions": [...] } }`;

async function buildSystemPrompt(feature: Feature, customSystemPrompt?: string | null, sources?: Source[]): Promise<string> {
  let base = feature === "generate" ? GENERATE_PROMPT : feature === "attack" ? ATTACK_PROMPT : feature === "brainstorm" ? BRAINSTORM_PROMPT : feature === "factoids" ? FACTOIDS_PROMPT : ASK_PROMPT;

  // Inject current date context for features with web research
  const webResearchFeatures: Feature[] = ["generate", "attack", "brainstorm", "factoids"];
  if (webResearchFeatures.includes(feature)) {
    base = base.replace("[DATE_CONTEXT]", getCurrentDateContext());
  }

  // Fetch global prompt from database (admin-configured)
  const globalPrompt = await getGlobalPrompt(feature);
  const globalSection = globalPrompt ? `\n\nADMIN-CONFIGURED INSTRUCTIONS:\n${globalPrompt}` : "";

  // User's custom prompt (from their settings)
  const custom = customSystemPrompt ? `\n\nCUSTOM SYSTEM PROMPT:\n${customSystemPrompt}` : "";

  const sourceText = sources && sources.length ? `\n\nLOCAL KNOWLEDGE BASE (use as primary factual source):\n${sources.map((s) => `--- ${s.title} (${s.origin || s.type}) ---\n${s.content}\n`).join("\n")}` : "";
  return `${base}${globalSection}${custom}${sourceText}`;
}

function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string) {
  if (feature === "generate") return `Motion: ${input.motion}\nSide: ${input.side}\nFormat: ${input.format}\nRole: ${input.role}\nLength: ${input.length}\nAudience: ${input.audience}\nTone: ${input.tone}\n\n${searchContext}`;
  if (feature === "attack") return `Analyze this case based on the following parameters:\n\nCASE TEXT:\n"${input.caseText}"\n\n${searchContext}`;
  if (feature === "brainstorm") return `Motion: ${input.motion}\nSide: ${input.side}\nOutput Mode: ${input.outputMode}\n${input.context ? `Context: ${input.context}` : ''}\n\n${searchContext}`;
  if (feature === "factoids") return `Find evidence for claim: "${input.claim}"\n\n${searchContext}\n\nRegion: ${input.region}\nSource Type: ${input.sourceType}\nTimeframe: ${input.timeframe || "Recent (last 5 years)"}\nLanguage: ${input.language}`;
  return `Message: ${input.message}\nMode: ${input.mode}`;
}

// ============== MAIN HANDLER ==============

Deno.serve(async (req) => {
  const requestId = generateRequestId();

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
    return badRequest("Invalid JSON body");
  }
  const feature = body.feature as Feature | undefined;
  const input = body.input as Record<string, unknown> | undefined;
  const provider = (body.provider as Provider | undefined) || DEFAULT_PROVIDER;
  const model = (body.model as string | undefined) || Deno.env.get("AI_DEFAULT_MODEL") || "gemini-2.0-flash";
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const customSystemPrompt = body.customSystemPrompt as string | null | undefined;
  const sources = (body.sources as Source[] | undefined) || [];

  // Log incoming request
  log(requestId, "INFO", "Request received", { feature, provider, model, sourcesCount: sources.length });

  if (!feature) return badRequest("Missing feature");
  if (!input) return badRequest("Missing input");
  const sanitizeResult = sanitizeInput(input);
  if ("rejected" in sanitizeResult) {
    log(requestId, "WARN", "Request rejected by sanitization", { reason: sanitizeResult.rejected });
    return badRequest(sanitizeResult.rejected);
  }
  const sanitizedInput = sanitizeResult.sanitized;
  if (customSystemPrompt) {
    const promptResult = sanitizePromptInput(customSystemPrompt, "customSystemPrompt");
    if ("rejected" in promptResult) {
      log(requestId, "WARN", "Custom prompt rejected", { reason: promptResult.rejected });
      return badRequest(promptResult.rejected);
    }
  }

  // Extract user ID from JWT authorization header
  let userId: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
      log(requestId, "INFO", "User authenticated", { userId });
    } catch (authErr) {
      log(requestId, "WARN", "Auth token validation failed", { error: authErr instanceof Error ? authErr.message : "Unknown" });
      // Anonymous request - continue without user
    }
  } else {
    log(requestId, "INFO", "No auth header provided, anonymous request");
  }

  // Check rate limits (includes subscription gating and model access)
  const rateLimit = await checkRateLimit(userId, model);
  if (!rateLimit.allowed) {
    await logUsage(userId, feature, provider, model, undefined, undefined, undefined, "rate_limited", rateLimit.code);
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
      const region = String(sanitizedInput.region || "");

      // Perform deep research with multiple search rounds
      const research = await deepResearch(claim, region, provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];

      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      // Post-process: verify URLs in the response
      if (output && typeof output === "object" && "factoids" in output) {
        const factoids = (output as { factoids: Array<{ citation: { url: string; verified: string } }> }).factoids;
        const verifyPromises = factoids.map(async (f) => {
          if (f.citation?.url && !research.verifiedUrls.has(f.citation.url)) {
            const isValid = await verifyUrl(f.citation.url);
            f.citation.verified = isValid ? "verified" : "unverified";
          }
        });
        await Promise.all(verifyPromises);
      }

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ASK: Optionally run web search and include URL context from chat
    if (feature === "ask") {
      const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
      const message = String(sanitizedInput.message || "");
      const mode = String(sanitizedInput.mode || "general");
      const citationMode = Boolean(sanitizedInput.citationMode);
      const webSearchEnabled = Boolean(sanitizedInput.webSearch);

      // 1) Read URLs already shared in chat to ground the response in user-provided material
      const urls = new Set<string>();
      extractUrls(message).forEach((u) => urls.add(u));
      history.slice(-3).forEach((m) => extractUrls(m.content).forEach((u) => urls.add(u)));

      let urlContext = "";
      if (urls.size > 0) {
        const contents = await Promise.all(Array.from(urls).slice(0, 3).map(async (u) => {
          const content = await jinaRead(u);
          return `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`;
        }));
        urlContext = "\n\nWEB PAGE CONTEXT:\n" + contents.join("\n");
      }

      // 2) Optional web search in Ask mode (AI decides when this message needs fresh data)
      let webSearchContext = "";
      if (webSearchEnabled) {
        const searchDecision = await decideAskSearch(message, history, provider, model);
        if (searchDecision.shouldSearch) {
          const research = await deepResearch(searchDecision.query, "", provider, model, ASK_RESEARCH);
          if (research.searches.length > 0 || research.readContent.length > 0) {
            webSearchContext = `\n\n${buildResearchContext(research)}`;
          }
        }
      }

      const prompt = `Message: ${message}
Mode: ${mode}
Citation Mode: ${citationMode ? "ON - be conservative and source claims when possible" : "OFF"}
Web Search: ${webSearchEnabled ? "ENABLED" : "DISABLED"}${urlContext}${webSearchContext}`;
      const messages = [...history, { role: "user", content: prompt }];
      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GENERATE: Use deep research for evidence-backed arguments
    if (feature === "generate") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "pro");

      // Perform deep research to find supporting evidence
      console.log("[GENERATE] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      // Post-process: force needsSource to false since we provided research
      if (output && typeof output === "object" && "contentions" in output) {
        const contentions = (output as { contentions: Array<{ needsSource?: boolean }> }).contentions;
        for (const c of contentions) {
          c.needsSource = false;
        }
      }

      // Post-process: fix timestamp
      if (output && typeof output === "object" && "metadata" in output) {
        const metadata = (output as { metadata: { generatedAt?: string } }).metadata;
        if (!metadata.generatedAt ||
          metadata.generatedAt === "CURRENT_ISO_TIMESTAMP" ||
          metadata.generatedAt.includes("CURRENT") ||
          isNaN(new Date(metadata.generatedAt).getTime())) {
          metadata.generatedAt = new Date().toISOString();
        }
      }

      // Build discovered sources from research
      const discoveredSources = research.readContent.map((item) => ({
        title: item.url.replace(/^https?:\/\//, "").split("/")[0],
        url: item.url,
        content: item.content.slice(0, 1000),
      }));
      console.log(`[GENERATE] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output, discoveredSources }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // BRAINSTORM: Use research to inform argument angles
    if (feature === "brainstorm") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");

      // Perform deep research to find relevant context
      console.log("[BRAINSTORM] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      // Build discovered sources from research
      const discoveredSources = research.readContent.map((item) => ({
        title: item.url.replace(/^https?:\/\//, "").split("/")[0],
        url: item.url,
        content: item.content.slice(0, 1000),
      }));
      console.log(`[BRAINSTORM] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output, discoveredSources }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ATTACK: Use deep research for evidence-based critique
    if (feature === "attack") {
      const caseText = String(sanitizedInput.caseText || "");

      // Research the topic to find counter-evidence
      console.log("[ATTACK] Starting deep research for case analysis");
      const research = await deepResearch(caseText.slice(0, 500), "", provider, model, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      const discoveredSources = research.readContent.map((item) => ({
        title: item.url.replace(/^https?:\/\//, "").split("/")[0],
        url: item.url,
        content: item.content.slice(0, 1000),
      }));
      console.log(`[ATTACK] Found ${discoveredSources.length} sources`);

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output, discoveredSources }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback for any other feature
    const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
    const messages = [{ role: "user", content: userPrompt }];
    const output = await callAI(provider, model, systemPrompt, messages, temperature);

    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
    return new Response(JSON.stringify({ output }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERROR]", message);

    // Log error
    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs, "error", message.slice(0, 100));
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
