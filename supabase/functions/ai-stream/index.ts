// Supabase Edge Function: streaming Ask proxy for DebateLab.
// Keeps provider keys server-side and uses SSE for progressive UI rendering.

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:18080",
  "http://127.0.0.1:18080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
  "capacitor://localhost",
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
import { isAskStreamingModeAllowed } from "../_shared/control-enforcement.ts";
import {
  calculateRequestCost,
  type CostResult,
  normalizeAnthropicUsage,
  normalizeGoogleUsage,
  normalizeOpenAIUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";

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
const GOOGLE_MODELS = new Set(["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite-preview"]);
const ANTHROPIC_MODELS = new Set(["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);
const MAX_INPUT_LENGTH = 50000;
const MAX_HISTORY_ITEMS = 8;

function getProviderForModel(model: string): "openai" | "google" | "anthropic" | null {
  if (OPENAI_MODELS.has(model)) return "openai";
  if (GOOGLE_MODELS.has(model)) return "google";
  if (ANTHROPIC_MODELS.has(model)) return "anthropic";
  return null;
}

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

  // A settings row is provisioned for every account on signup and can no
  // longer be deleted by the client (see 20260819000000 security_hardening.sql).
  // A missing row is untrusted, not a new user — fail closed.
  if (!user) return { tier: "expired", dailyLimit: 0, canAccessProModels: false };

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
      console.error("[AI STREAM] Quota reservation failed:", quotaError);
      return { allowed: false, reason: "Unable to verify your quota. Please try again.", statusCode: 500 };
    }

    const quotaRow = Array.isArray(quota) ? quota[0] : quota;
    const current = quotaRow?.current_count ?? 0;
    if (!quotaRow?.allowed) {
      return { allowed: false, reason: `You've used all ${dailyLimit} of your daily requests. ${sub.tier === "pro" ? "Limit resets at midnight UTC." : "Upgrade to Pro for 50 daily requests."}`, code: "limit_reached", limit: dailyLimit, current, statusCode: 402 };
    }

    return { allowed: true, limit: dailyLimit, current };
  } catch (err) {
    console.error("[AI STREAM] Rate-limit check failed:", err);
    return { allowed: false, reason: "Unable to verify your account access. Please try again.", statusCode: 500 };
  }
}

async function logUsage(
  userId: string,
  provider: string,
  model: string,
  usage?: NormalizedUsage,
  latencyMs?: number,
  status = "success",
  errorCode?: string,
) {
  try {
    const cost: CostResult = usage
      ? calculateRequestCost({ provider, model, usage })
      : calculateRequestCost({ provider, model });

    const row: Record<string, unknown> = {
      user_id: userId,
      feature: "ask",
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
      console.warn("[AI STREAM] Audit columns missing; logging base row only:", error.message);
      ({ error } = await supabase.from("ai_requests").insert(row));
    }
    if (error) throw error;
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

  const model = sanitizeText(body.model, 80) || "gpt-5.4-mini";
  const input = body.input && typeof body.input === "object" ? body.input as Record<string, unknown> : {};
  const mode = sanitizeText(input.mode, 40) || "general";

  if (body.feature !== "ask") {
    return jsonResponse({ error: "Streaming currently supports Ask only" }, 400, corsHeaders);
  }

  if (!isAskStreamingModeAllowed(mode)) {
    return jsonResponse({ error: "Streaming is not available for clarify mode" }, 400, corsHeaders);
  }

  const advancedMode = Boolean(input.citationMode || input.webSearch || input.prosConsMode || input.argumentMapMode);
  // Provider is derived strictly from the allowlisted model, never from the
  // client-supplied provider field, so an unlisted model can't reach any provider API.
  const resolvedProvider = getProviderForModel(model);

  if (!resolvedProvider || advancedMode) {
    return jsonResponse({ error: "Streaming is not available for this model/mode combination" }, 400, corsHeaders);
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
  const googleKey = Deno.env.get("GOOGLE_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  const providerKey = resolvedProvider === "openai" ? openaiKey
    : resolvedProvider === "google" ? googleKey
    : resolvedProvider === "anthropic" ? anthropicKey
    : null;

  if (!providerKey) {
    return jsonResponse({ error: `${resolvedProvider} is not configured` }, 500, corsHeaders);
  }

  const history = normalizeHistory(input.history);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = "";
      const streamUsageParts: Record<string, Record<string, unknown>> = { openai: {}, anthropic: {}, google: {} };

      // Merge streamed usage fragments per provider, then normalize once at the end.
      const mergeUsage = (part: "openai" | "anthropic" | "google", patch: Record<string, unknown>) => {
        streamUsageParts[part] = { ...streamUsageParts[part], ...patch };
      };
      const collectUsage = (): NormalizedUsage | undefined => {
        if (resolvedProvider === "openai") {
          return Object.keys(streamUsageParts.openai).length ? normalizeOpenAIUsage(streamUsageParts.openai) : undefined;
        }
        if (resolvedProvider === "anthropic") {
          return Object.keys(streamUsageParts.anthropic).length ? normalizeAnthropicUsage(streamUsageParts.anthropic) : undefined;
        }
        if (resolvedProvider === "google") {
          return Object.keys(streamUsageParts.google).length ? normalizeGoogleUsage(streamUsageParts.google) : undefined;
        }
        return undefined;
      };

      const emit = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(event, payload)));
      };

      const upstreamAbort = new AbortController();
      const clientAbortHandler = () => upstreamAbort.abort();
      req.signal.addEventListener("abort", clientAbortHandler);

      try {
        const messages = buildMessages(userMessage, history, mode);

        if (resolvedProvider === "openai") {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, temperature, stream: true, stream_options: { include_usage: true } }),
            signal: upstreamAbort.signal,
          });
          if (!response.ok || !response.body) throw new Error(await response.text() || `OpenAI ${response.status}`);

          const reader = response.body.getReader();
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
              let parsed: Record<string, unknown>;
              try { parsed = JSON.parse(data); } catch { continue; }
              const delta = (parsed.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) { accumulated += delta; emit("delta", { text: delta }); }
              const usage = parsed.usage as Record<string, unknown> | undefined;
              if (usage) mergeUsage("openai", usage);
            }
          }

        } else if (resolvedProvider === "google") {
          const geminiMessages = messages.map((m) => ({
            role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : "user",
            parts: [{ text: m.content }],
          }));
          // Gemini API: system instruction is separate
          const systemInstruction = messages.find((m) => m.role === "system");
          const contents = geminiMessages.filter((_, i) => messages[i].role !== "system");

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${providerKey}`;
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } } : {}),
              generationConfig: { temperature },
            }),
            signal: upstreamAbort.signal,
          });
          if (!response.ok || !response.body) throw new Error(await response.text() || `Gemini ${response.status}`);

          const reader = response.body.getReader();
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
              let parsed: Record<string, unknown>;
              try { parsed = JSON.parse(data); } catch { continue; }
              const candidates = parsed.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
              const text = candidates?.[0]?.content?.parts?.[0]?.text;
              if (typeof text === "string" && text) { accumulated += text; emit("delta", { text }); }
              const usageMeta = parsed.usageMetadata as Record<string, unknown> | undefined;
              if (usageMeta) mergeUsage("google", usageMeta);
            }
          }

        } else if (resolvedProvider === "anthropic") {
          const systemMsg = messages.find((m) => m.role === "system")?.content || "";
          const anthropicMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": providerKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: anthropicMessages, temperature, stream: true }),
            signal: upstreamAbort.signal,
          });
          if (!response.ok || !response.body) throw new Error(await response.text() || `Anthropic ${response.status}`);

          const reader = response.body.getReader();
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
              if (trimmed.startsWith("event:")) continue;
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice("data:".length).trim();
              let parsed: Record<string, unknown>;
              try { parsed = JSON.parse(data); } catch { continue; }
              if (parsed.type === "content_block_delta") {
                const delta = (parsed.delta as { text?: string })?.text;
                if (typeof delta === "string" && delta) { accumulated += delta; emit("delta", { text: delta }); }
              }
              if (parsed.type === "message_start") {
                const usage = (parsed.message as { usage?: Record<string, unknown> } | undefined)?.usage;
                if (usage) mergeUsage("anthropic", usage);
              }
              if (parsed.type === "message_delta") {
                const usage = parsed.usage as Record<string, unknown> | undefined;
                if (usage) mergeUsage("anthropic", usage);
              }
            }
          }
        }

        const output = {
          response: accumulated.trim(),
          model,
          provider: resolvedProvider,
          durationMs: Date.now() - startedAt,
          generatedAt: new Date().toISOString(),
          followUpQuestions: [],
          uncertainties: accumulated.trim() ? [] : ["The model returned an empty streamed response."],
        };

        if (!req.signal.aborted) {
          emit("final", { output });
        }
        await logUsage(user.id, resolvedProvider, model, collectUsage(), Date.now() - startedAt);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Streaming failed";
        const isAbort = req.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
        if (!isAbort) {
          emit("error", { message: errorMessage });
        }
        await logUsage(
          user.id,
          resolvedProvider,
          model,
          collectUsage(),
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
