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

// ============== RATE LIMITING ==============

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
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

async function checkRateLimit(userId: string | null): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // Anonymous users not rate limited (for now)

  try {
    // First check if user is banned
    const isBanned = await checkUserBanned(userId);
    if (isBanned) {
      return { allowed: false, reason: "Your account has been suspended. Please contact support." };
    }

    // Get user's daily request count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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

    // Get user-specific limit, or fall back to global limit
    const { data: userLimit } = await supabase
      .from("rate_limits")
      .select("limit_value")
      .eq("user_id", userId)
      .eq("limit_type", "daily_requests")
      .single();

    if (userLimit) {
      if (currentCount >= userLimit.limit_value) {
        return { allowed: false, reason: "Daily request limit exceeded", limit: userLimit.limit_value, current: currentCount };
      }
      return { allowed: true, limit: userLimit.limit_value, current: currentCount };
    }

    // Check global limit
    const { data: globalLimit } = await supabase
      .from("rate_limits")
      .select("limit_value")
      .is("user_id", null)
      .eq("limit_type", "daily_requests")
      .single();

    if (globalLimit && currentCount >= globalLimit.limit_value) {
      return { allowed: false, reason: "Daily request limit exceeded", limit: globalLimit.limit_value, current: currentCount };
    }

    return { allowed: true, limit: globalLimit?.limit_value, current: currentCount };
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

async function deepResearch(
  claim: string,
  region: string,
  provider: Provider,
  model: string
): Promise<ResearchContext> {
  const context: ResearchContext = {
    searches: [],
    readContent: [],
    verifiedUrls: new Set(),
  };

  console.log("[DEEP RESEARCH] Starting for claim:", claim);

  // Round 1: Initial search
  const initialQuery = `${claim} ${region} statistics data`;
  const round1Results = await jinaSearch(initialQuery);
  const round1Text = formatSearchResults(round1Results);
  context.searches.push({ query: initialQuery, results: round1Text });
  console.log(`[DEEP RESEARCH] Round 1: ${round1Results.length} results`);

  // Extract URLs for reading
  const urlsToRead = round1Results.slice(0, 3).map((r) => r.url).filter(Boolean) as string[];

  // Round 2: AI generates follow-up queries
  const followUpQueries = await generateFollowUpQueries(claim, round1Text, provider, model);
  console.log(`[DEEP RESEARCH] Follow-up queries: ${followUpQueries.join(", ")}`);

  // Execute follow-up searches in parallel
  const followUpPromises = followUpQueries.map(async (query) => {
    const results = await jinaSearch(query);
    const text = formatSearchResults(results);
    context.searches.push({ query, results: text });
    // Add more URLs to read
    results.slice(0, 2).forEach((r) => {
      if (r.url && !urlsToRead.includes(r.url)) urlsToRead.push(r.url);
    });
    return results.length;
  });
  await Promise.all(followUpPromises);
  console.log(`[DEEP RESEARCH] Round 2 complete, ${context.searches.length} total searches`);

  // Round 3: Read top URLs for full content
  const readPromises = urlsToRead.slice(0, 5).map(async (url) => {
    const content = await jinaRead(url);
    if (content) {
      context.readContent.push({ url, content });
      context.verifiedUrls.add(url);
    }
    return content.length > 0;
  });
  await Promise.all(readPromises);
  console.log(`[DEEP RESEARCH] Read ${context.readContent.length} pages`);

  return context;
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

const GENERATE_PROMPT = `You are an expert debate coach. Generate a structured debate case in JSON format.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

CRITICAL - STRICT JSON SCHEMA REQUIREMENT:
You MUST return a valid JSON object with EXACTLY these fields. Do NOT use different field names.
Do NOT add extra fields. Do NOT omit any fields. Follow this structure EXACTLY:

{
  "caseStructure": {
    "thesis": "The main thesis statement for the debate",
    "framework": "The framework or lens through which to view the debate",
    "keyDefinitions": ["definition1", "definition2"],
    "burdenOfProof": "What we must prove to win"
  },
  "contentions": [
    {
      "id": "1",
      "claim": "The main claim of this contention",
      "reasoning": "Why this claim is true",
      "evidence": "Supporting evidence",
      "needsSource": false,
      "sourceQuery": "",
      "impact": "Why this matters"
    }
  ],
  "predictedOpponentCase": {
    "likelyArguments": ["Argument opponent will make"],
    "strategicWeaknesses": ["Weakness in our case"],
    "keyClashes": ["Main clash points"]
  },
  "counters": [
    {
      "targetArgument": "What opponent argument this counters",
      "counterpoint": "Our counter to that argument",
      "rebuttal": "How to phrase the rebuttal"
    }
  ],
  "metadata": {
    "side": "pro",
    "format": "custom",
    "generatedAt": "CURRENT_ISO_TIMESTAMP"
  }
}

IMPORTANT: The "side" in metadata must be exactly "pro" or "con". Always include the generatedAt timestamp.`;

const ATTACK_PROMPT = `You are an expert debate judge and coach. Analyze the given debate case and provide a critical breakdown in JSON format.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

Analyze weaknesses, fallacies, and generate cross-ex questions.
Return JSON matching:
{
  "overallAssessment": { "score": number (0-100), "summary": "string", "strengthAreas": ["string"] },
  "weaknesses": [{ "id": "string", "severity": "critical|major|minor", "type": "evidential|logical|structural", "description": "string", "whyWeak": "string", "howOpponentAttacks": "string", "improvedVersion": "string", "affectedQuote": "string" }],
  "fallaciesDetected": [{ "name": "string", "location": "string", "explanation": "string" }],
  "crossExQuestions": [{ "question": "string", "purpose": "string", "expectedTrap": "string" }],
  "weighingAnalysis": { "currentWeighing": "string", "missingComparisons": ["string"], "improvementSuggestions": ["string"] }
}`;

const BRAINSTORM_PROMPT = `You are a creative debate strategist. Brainstorm arguments and angles for the given motion.

CRITICAL: The debate format is strictly:
- Introductor (4 min): Introduces the team and presents the arguments.
- R1 (6 min): 4 minutes of stating and reasoning arguments, followed by 2 minutes of refuting the opponent's arguments.
- R2 (6 min): Builds further on R1's arguments but primarily focuses on refuting the opponent.
- Conclusor (3 min): Summarizes the debate and explains why this team wins.

CRITICAL - STRICT JSON SCHEMA REQUIREMENT:
You MUST return a valid JSON object with EXACTLY these fields based on the requested outputMode.
Do NOT use different field names. Do NOT omit required fields. Follow this structure EXACTLY:

The Idea object structure (used in all output modes):
{
  "id": "unique-string-id",
  "title": "Short title for the idea",
  "description": "Detailed description of the argument angle",
  "side": "pro" | "con" | "neutral",
  "strength": "strong" | "moderate" | "weak",
  "tradeoffs": ["potential downside 1", "potential downside 2"],
  "relatedTo": ["id-of-related-idea"]
}

For outputMode "topfive", return:
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "topFive": [
    {
      "rank": 1,
      "idea": { /* Idea object */ },
      "whyTop": "Explanation of why this is a top argument"
    }
  ],
  "nextSteps": ["Suggested next step 1", "Suggested next step 2"],
  "warningsAndTradeoffs": ["Warning or tradeoff to consider"]
}

For outputMode "mindmap", return:
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "mindmap": [
    {
      "category": "Category name (e.g., Economic, Social, Political)",
      "items": [
        { /* Idea object */ }
      ]
    }
  ],
  "nextSteps": ["Suggested next step 1"],
  "warningsAndTradeoffs": ["Warning or tradeoff to consider"]
}

For outputMode "buckets", return:
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "buckets": [
    {
      "name": "Bucket name (e.g., Strong Arguments, Risky but High-Reward)",
      "ideas": [
        { /* Idea object */ }
      ],
      "keyInsight": "Main insight about this bucket of arguments"
    }
  ],
  "nextSteps": ["Suggested next step 1"],
  "warningsAndTradeoffs": ["Warning or tradeoff to consider"]
}

If the motion is unclear and you need more information, return:
{
  "needsMoreInfo": true,
  "clarifyingQuestions": ["Question 1?", "Question 2?"],
  "nextSteps": [],
  "warningsAndTradeoffs": []
}

IMPORTANT:
- Always include ALL required fields, even if empty arrays
- Every Idea MUST have all fields: id, title, description, side, strength, tradeoffs, relatedTo
- Generate at least 3-5 ideas for the requested output mode
- Make ideas specific, actionable, and debate-ready`;

const FACTOIDS_PROMPT = `You are an expert research assistant specializing in finding verifiable evidence for debate.

IMPORTANT: You have been provided with DEEP RESEARCH including multiple web searches and full page content from verified sources.

For each factoid:
1. Use ONLY information from the provided research context
2. Include the exact URL from the source in citation.url
3. Set citation.verified to "verified" if the source was fully read, "unverified" otherwise
4. Be specific with statistics, dates, and figures

Output JSON matching:
{
  "factoids": [{ 
    "id": "string", 
    "shortClaim": "string (one sentence)", 
    "keyFigure": "string (the main statistic or data point)", 
    "context": "string (background and methodology)", 
    "limitations": "string", 
    "citation": { 
      "title": "string", 
      "publisher": "string", 
      "date": "string", 
      "url": "string (MUST be from research context)", 
      "verified": "verified|unverified" 
    }, 
    "howToUse": "string", 
    "relevanceScore": number (0-100) 
  }],
  "searchSuggestions": ["string (additional queries for more evidence)"], 
  "warnings": ["string"], 
  "researchSummary": "string (brief summary of the research process)",
  "verificationStatus": "complete"
}`;

const ASK_PROMPT = `You are a debate coach chat bot. Answer the user's question.

Output JSON matching:
{ "response": "string (markdown supported)", "followUpQuestions": ["string"], "uncertainties": ["string"], "prosConsAnalysis": { "pros": [...], "cons": [...] }, "argumentMap": { "mainClaim": "string", "supportingPoints": [...], "counterpoints": [...], "assumptions": [...] } }`;

async function buildSystemPrompt(feature: Feature, customSystemPrompt?: string | null, sources?: Source[]): Promise<string> {
  const base = feature === "generate" ? GENERATE_PROMPT : feature === "attack" ? ATTACK_PROMPT : feature === "brainstorm" ? BRAINSTORM_PROMPT : feature === "factoids" ? FACTOIDS_PROMPT : ASK_PROMPT;

  // Fetch global prompt from database (admin-configured)
  const globalPrompt = await getGlobalPrompt(feature);
  const globalSection = globalPrompt ? `\n\nADMIN-CONFIGURED INSTRUCTIONS:\n${globalPrompt}` : "";

  // User's custom prompt (from their settings)
  const custom = customSystemPrompt ? `\n\nCUSTOM SYSTEM PROMPT:\n${customSystemPrompt}` : "";

  const sourceText = sources && sources.length ? `\n\nLOCAL KNOWLEDGE BASE (use as primary factual source):\n${sources.map((s) => `--- ${s.title} (${s.origin || s.type}) ---\n${s.content}\n`).join("\n")}` : "";
  return `${base}${globalSection}${custom}${sourceText}`;
}

function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string) {
  if (feature === "generate") return `Motion: ${input.motion}\nSide: ${input.side}\nFormat: ${input.format}\nRole: ${input.role}\nLength: ${input.length}\nAudience: ${input.audience}\nTone: ${input.tone}`;
  if (feature === "attack") return `Analyze this case based on the following parameters:\n\nCASE TEXT:\n"${input.caseText}"`;
  if (feature === "brainstorm") return `Motion: ${input.motion}\nSide: ${input.side}\nOutput Mode: ${input.outputMode}\n${input.context ? `Context: ${input.context}` : ''}`;
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

  // Check rate limits
  const rateLimit = await checkRateLimit(userId);
  if (!rateLimit.allowed) {
    await logUsage(userId, feature, provider, model, undefined, undefined, undefined, "rate_limited");
    return new Response(JSON.stringify({
      error: rateLimit.reason,
      limit: rateLimit.limit,
      current: rateLimit.current
    }), {
      status: 429,
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
      const research = await deepResearch(claim, region, provider, model);
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

    // ASK: Read URLs mentioned in messages
    if (feature === "ask") {
      const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
      const message = String(sanitizedInput.message || "");
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
      const prompt = `Message: ${message}${urlContext}\nMode: ${sanitizedInput.mode}`;
      const messages = [...history, { role: "user", content: prompt }];
      const output = await callAI(provider, model, systemPrompt, messages, temperature);

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, undefined, undefined, latencyMs);
      return new Response(JSON.stringify({ output }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Other features: standard flow
    const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
    const messages = [{ role: "user", content: userPrompt }];
    const output = await callAI(provider, model, systemPrompt, messages, temperature);

    // Log usage and return
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
