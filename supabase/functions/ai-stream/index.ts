// Supabase Edge Function: streaming Ask proxy for DebateLab.
// Keeps provider keys server-side and uses SSE for progressive UI rendering.

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAskModeGuidance } from "../ai/prompt-builder.ts";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type RateLimitResult = {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  code?: "limit_reached" | "trial_expired" | "banned" | "upgrade_required";
  statusCode?: number;
};

type SubscriptionInfo = {
  tier: string;
  dailyLimit: number;
  canAccessProModels: boolean;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const PRO_MODELS = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "gemini-3.1-pro-preview",
]);

const OPENAI_MODELS = new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini"]);
const MAX_INPUT_LENGTH = 50000;
const MAX_HISTORY_ITEMS = 8;

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sse(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sanitizeText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .slice(0, limit);
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_ITEMS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const role = (item as Record<string, unknown>).role;
    const content = sanitizeText((item as Record<string, unknown>).content, 6000);
    if ((role === "user" || role === "assistant") && content) return [{ role, content }];
    return [];
  });
}

function buildMessages(message: string, history: ChatMessage[], mode: string) {
  const system = [
    "You are DebateLab's live debate coach.",
    "Answer in clear Markdown that can stream smoothly token by token.",
    "Be direct, concrete, and honest about uncertainty.",
    "Do not invent citations. If the user asks for sources, explain that citation/search mode should be used.",
    `Mode guidance: ${getAskModeGuidance(mode)}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: message },
  ];
}

async function checkUserBanned(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  return data?.role === "banned";
}

async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  const { data: user } = await supabase
    .from("user_settings")
    .select("subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at")
    .eq("user_id", userId)
    .single();

  if (!user) return { tier: "trial", dailyLimit: 5, canAccessProModels: false };

  const tier = user.subscription_tier || "trial";
  const limitOrDefault = (defaultLimit: number) => user.daily_limit_override ?? defaultLimit;
  const now = new Date();
  const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const graceEnd = user.grace_period_ends_at ? new Date(user.grace_period_ends_at) : null;

  if (tier === "legacy_free") {
    if (graceEnd && now < graceEnd) return { tier, dailyLimit: limitOrDefault(50), canAccessProModels: true };
    if (trialEnd && now < trialEnd) return { tier: "trial", dailyLimit: limitOrDefault(5), canAccessProModels: false };
    return { tier: "expired", dailyLimit: limitOrDefault(0), canAccessProModels: false };
  }

  if (tier === "pro") {
    if (graceEnd && now < graceEnd) return { tier, dailyLimit: limitOrDefault(50), canAccessProModels: true };

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
    if (activeSubscription) return { tier, dailyLimit: limitOrDefault(50), canAccessProModels: true };
    if (trialEnd && now < trialEnd) return { tier: "trial", dailyLimit: limitOrDefault(5), canAccessProModels: false };
    return { tier: "expired", dailyLimit: limitOrDefault(0), canAccessProModels: false };
  }

  if (tier === "trial") {
    if (trialEnd && now < trialEnd) return { tier, dailyLimit: limitOrDefault(5), canAccessProModels: false };
    return { tier: "expired", dailyLimit: limitOrDefault(0), canAccessProModels: false };
  }

  return { tier: "expired", dailyLimit: limitOrDefault(0), canAccessProModels: false };
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

  if (typeof userLimit?.limit_value === "number") return userLimit.limit_value;

  const { data: globalLimit } = await supabase
    .from("rate_limits")
    .select("limit_value")
    .is("user_id", null)
    .eq("limit_type", "daily_requests")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return typeof globalLimit?.limit_value === "number" ? globalLimit.limit_value : fallbackLimit;
}

async function checkRateLimit(userId: string, model: string): Promise<RateLimitResult> {
  try {
    if (await checkUserBanned(userId)) {
      return { allowed: false, reason: "Your account has been suspended. Please contact support.", code: "banned", statusCode: 403 };
    }

    const sub = await getSubscriptionInfo(userId);
    const dailyLimit = sub.tier === "expired" && sub.dailyLimit === 0
      ? 0
      : await getConfiguredDailyLimit(userId, sub.dailyLimit);

    if (sub.tier === "expired" && dailyLimit === 0) {
      return { allowed: false, reason: "Your free trial has ended. Upgrade to Pro to continue using DebateLab.", code: "trial_expired", limit: 0, current: 0, statusCode: 402 };
    }

    if (PRO_MODELS.has(model) && !sub.canAccessProModels) {
      return { allowed: false, reason: "This model requires a Pro subscription. Upgrade to unlock advanced models.", code: "upgrade_required", statusCode: 403 };
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from("ai_requests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString());

    if (error) return { allowed: true };

    const current = count || 0;
    if (dailyLimit > 0 && current >= dailyLimit) {
      return { allowed: false, reason: `You've used all ${dailyLimit} of your daily requests. ${sub.tier === "pro" ? "Limit resets at midnight UTC." : "Upgrade to Pro for 50 daily requests."}`, code: "limit_reached", limit: dailyLimit, current, statusCode: 402 };
    }

    return { allowed: true, limit: dailyLimit, current };
  } catch {
    return { allowed: true };
  }
}

async function logUsage(
  userId: string,
  provider: string,
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  latencyMs?: number,
  status = "success",
  errorCode?: string,
) {
  try {
    await supabase.from("ai_requests").insert({
      user_id: userId,
      feature: "ask",
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      status,
      error_code: errorCode,
    });
  } catch (err) {
    console.warn("[AI STREAM] Failed to log usage:", err);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentication required" }, 401, corsHeaders);
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Invalid authentication token" }, 401, corsHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const provider = body.provider === "lovable" ? "openai" : String(body.provider || "openai");
  const model = sanitizeText(body.model, 80) || "gpt-5.4-mini";
  const input = body.input && typeof body.input === "object" ? body.input as Record<string, unknown> : {};
  const advancedMode = Boolean(input.citationMode || input.webSearch || input.prosConsMode || input.argumentMapMode);

  if (body.feature !== "ask") {
    return jsonResponse({ error: "Streaming currently supports Ask only" }, 400, corsHeaders);
  }

  if (provider !== "openai" || !OPENAI_MODELS.has(model) || advancedMode) {
    return jsonResponse({ error: "Streaming is only available for basic OpenAI Ask chats" }, 400, corsHeaders);
  }

  const userMessage = sanitizeText(input.message, MAX_INPUT_LENGTH);
  if (!userMessage.trim()) return jsonResponse({ error: "Message is required" }, 400, corsHeaders);

  const rateLimit = await checkRateLimit(user.id, model);
  if (!rateLimit.allowed) {
    return jsonResponse({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current,
    }, rateLimit.statusCode || 402, corsHeaders);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "OpenAI is not configured" }, 500, corsHeaders);
  }

  const mode = sanitizeText(input.mode, 40) || "general";
  const history = normalizeHistory(input.history);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = "";
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

      const emit = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(event, payload)));
      };

      const upstreamAbort = new AbortController();
      const clientAbortHandler = () => upstreamAbort.abort();
      req.signal.addEventListener("abort", clientAbortHandler);

      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: buildMessages(userMessage, history, mode),
            temperature,
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal: upstreamAbort.signal,
        });

        if (!openaiResponse.ok || !openaiResponse.body) {
          const errorText = await openaiResponse.text();
          throw new Error(errorText || `OpenAI request failed (${openaiResponse.status})`);
        }

        const reader = openaiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (req.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice("data:".length).trim();
            if (data === "[DONE]") continue;

            let parsed: { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
            try {
              parsed = JSON.parse(data);
            } catch {
              // Skip malformed chunks rather than killing the whole stream.
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              accumulated += delta;
              emit("delta", { text: delta });
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
              outputTokens = parsed.usage.completion_tokens ?? outputTokens;
            }
          }
        }

        const output = {
          response: accumulated.trim(),
          followUpQuestions: [],
          uncertainties: accumulated.trim() ? [] : ["The model returned an empty streamed response."],
        };

        if (!req.signal.aborted) {
          emit("final", { output });
        }
        await logUsage(user.id, provider, model, inputTokens, outputTokens, Date.now() - startedAt);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Streaming failed";
        const isAbort = req.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
        if (!isAbort) {
          emit("error", { message: errorMessage });
        }
        await logUsage(
          user.id,
          provider,
          model,
          inputTokens,
          outputTokens,
          Date.now() - startedAt,
          isAbort ? "cancelled" : "error",
          isAbort ? "client_abort" : "stream_error",
        );
      } finally {
        req.signal.removeEventListener("abort", clientAbortHandler);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
});
