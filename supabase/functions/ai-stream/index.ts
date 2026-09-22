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
import { isAskStreamingModeAllowed, validateControlInput } from "../_shared/control-enforcement.ts";
import { buildStreamingAskSystemPrompt } from "../_shared/prompts.ts";
import {
  calculateRequestCost,
  type CostResult,
  markIncompleteUsage,
  normalizeOpenRouterUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  AUTO_PRO,
  DEFAULT_MODEL,
  effectiveReasoningEffort,
  getModelCatalogEntry,
  isAutoModelSelection,
  isModelSelection,
  isReasoningEffort,
  MAX_REQUEST_OUTPUT_TOKENS,
  type ModelCatalogEntry,
  type ModelSelection,
  type ReasoningEffort,
} from "../_shared/model-catalog.ts";
import { resolveModelSelection } from "../_shared/auto-model-router.ts";
import { JEV_MODEL } from "../_shared/jev.ts";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type RateLimitResult = {
  allowed: boolean;
  canAccessProModels?: boolean;
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

const MAX_INPUT_LENGTH = 50000;
const MAX_HISTORY_ITEMS = 8;
const OPENROUTER_PROVIDER = "openrouter" as const;

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return Response.json(body, { status, headers: corsHeaders });
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

export function buildMessages(message: string, history: ChatMessage[], mode: string, language: unknown = "en") {
  const system = buildStreamingAskSystemPrompt(getAskModeGuidance(mode), language);
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

async function checkRateLimit(userId: string, model: ModelSelection): Promise<RateLimitResult> {
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

    if ((model === AUTO_PRO || (!isAutoModelSelection(model) && getModelCatalogEntry(model)?.isProOnly)) && !sub.canAccessProModels) {
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

    return { allowed: true, limit: dailyLimit, current, canAccessProModels: sub.canAccessProModels };
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
  feature = "ask",
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

    const { error } = await supabase.from("ai_requests").insert({ ...row, ...auditFields });
    if (error) throw error;
  } catch (err) {
    console.warn("[AI STREAM] Failed to log usage:", err);
  }
}

export async function handleRequest(req: Request): Promise<Response> {
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

  if (body.feature !== "ask") {
    return jsonResponse({ error: "Streaming currently supports Ask only" }, 400, corsHeaders);
  }

  const rawModel = sanitizeText(body.model, 80) || DEFAULT_MODEL;
  if (!isModelSelection(rawModel)) return jsonResponse({ error: "Unsupported model or provider combination" }, 400, corsHeaders);
  const requestedModel: ModelSelection = rawModel;
  const requestedReasoningEffort = body.reasoningEffort === undefined
    ? undefined
    : isReasoningEffort(body.reasoningEffort) ? body.reasoningEffort : null;
  if (requestedReasoningEffort === null) return jsonResponse({ error: "Invalid reasoning effort" }, 400, corsHeaders);
  const rawInput = body.input && typeof body.input === "object" && !Array.isArray(body.input)
    ? body.input as Record<string, unknown>
    : {};
  const input: Record<string, unknown> = {
    ...rawInput,
    ...(typeof rawInput.mode === "string" ? { mode: sanitizeText(rawInput.mode, 40) } : {}),
  };
  const controlError = validateControlInput("ask", input);
  if (controlError) return jsonResponse({ error: controlError }, 400, corsHeaders);

  const mode = typeof input.mode === "string" ? input.mode : "general";
  if (!isAskStreamingModeAllowed(mode)) {
    return jsonResponse({ error: `Streaming is not available for ${mode} mode` }, 400, corsHeaders);
  }

  const advancedMode = Boolean(input.citationMode || input.webSearch || input.prosConsMode || input.argumentMapMode);
  if (advancedMode) {
    return jsonResponse({ error: "Streaming is not available for this model/mode combination" }, 400, corsHeaders);
  }

  const userMessage = sanitizeText(input.message, MAX_INPUT_LENGTH);
  if (!userMessage.trim()) return jsonResponse({ error: "Message is required" }, 400, corsHeaders);

  const rateLimit = await checkRateLimit(user.id, requestedModel);
  if (!rateLimit.allowed) {
    return jsonResponse({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current,
    }, rateLimit.statusCode || 402, corsHeaders);
  }

  const routingStartedAt = Date.now();
  let model: string;
  let modelEntry: ModelCatalogEntry;
  try {
    const resolution = await resolveModelSelection({
      requestedModel,
      feature: "ask",
      input,
      canAccessProModels: Boolean(rateLimit.canAccessProModels),
      reasoningEffort: requestedReasoningEffort,
      signal: req.signal,
    });
    model = resolution.resolvedModel;
    modelEntry = resolution.modelEntry;
    const routingUsage = resolution.jev?.usage ?? resolution.jevUsage;
    if (routingUsage) {
      await logUsage(
        user.id,
        OPENROUTER_PROVIDER,
        JEV_MODEL,
        routingUsage,
        Date.now() - routingStartedAt,
        resolution.jevUsage ? "error" : "success",
        resolution.jevUsage ? "jev_incomplete" : undefined,
        "jev_model_router",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model routing failed";
    return jsonResponse({ error: message.includes("Pro") ? message : "Unable to route this request" }, message.includes("Pro") ? 403 : 500, corsHeaders);
  }

  const reasoningEffort = effectiveReasoningEffort(model, requestedReasoningEffort ?? undefined, Boolean(rateLimit.canAccessProModels));
  console.info(JSON.stringify({
    function: "ai-stream",
    event: "model_controls",
    model,
    requestedReasoningEffort: requestedReasoningEffort ?? "medium",
    effectiveReasoningEffort: reasoningEffort,
  }));
  const providerKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!providerKey) return jsonResponse({ error: "OpenRouter is not configured" }, 500, corsHeaders);

  const history = normalizeHistory(input.history);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = "";
      let streamUsageRaw: Record<string, unknown> | undefined;
      let streamSawDone = false;
      let streamSawFinishReason = false;
      const collectUsage = (): NormalizedUsage => {
        return streamUsageRaw
          ? normalizeOpenRouterUsage(streamUsageRaw)
          : { raw: { stream_usage_missing: true } };
      };

      const emit = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(event, payload)));
      };

      const upstreamAbort = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancelUpstream = () => {
        upstreamAbort.abort();
        void reader?.cancel().catch(() => undefined);
      };
      const clientAbortHandler = cancelUpstream;
      req.signal.addEventListener("abort", clientAbortHandler);

      try {
        if (req.signal.aborted) throw new DOMException("Client aborted", "AbortError");
        const messages = buildMessages(userMessage, history, mode, input.language);

        const payload: Record<string, unknown> = {
          model,
          messages,
          max_tokens: Math.min(modelEntry.maxTokens, MAX_REQUEST_OUTPUT_TOKENS),
          reasoning: { effort: reasoningEffort, exclude: true },
          provider: { require_parameters: true },
          stream: true,
          stream_options: { include_usage: true },
        };
        if (modelEntry.supportsTemperature) payload.temperature = temperature;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: upstreamAbort.signal,
        });
        if (!response.ok || !response.body) throw new Error(await response.text() || `OpenRouter ${response.status}`);

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const data = trimmed.slice("data:".length).trim();
          if (data === "[DONE]") {
            streamSawDone = true;
            return;
          }
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { return; }
          if (parsed.error) {
            const providerError = parsed.error;
            const message = providerError && typeof providerError === "object" && "message" in providerError
              ? (providerError as { message?: unknown }).message
              : providerError;
            throw new Error(typeof message === "string" ? message : "OpenRouter stream error");
          }
          const delta = (Array.isArray(parsed.choices) ? parsed.choices[0] : undefined) as { delta?: { content?: string }; finish_reason?: unknown } | undefined;
          if (typeof delta?.finish_reason === "string" && delta.finish_reason) streamSawFinishReason = true;
          if (typeof delta?.delta?.content === "string" && delta.delta.content) {
            accumulated += delta.delta.content;
            emit("delta", { text: delta.delta.content });
          }
          if (parsed.usage && typeof parsed.usage === "object" && !Array.isArray(parsed.usage)) {
            streamUsageRaw = { ...streamUsageRaw, ...(parsed.usage as Record<string, unknown>) };
          }
        };
        while (true) {
          if (req.signal.aborted) throw new DOMException("Client aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            processLine(line);
            if (streamSawDone) break;
          }
          if (streamSawDone) break;
        }
        if (!streamSawDone) {
          buffer += decoder.decode();
          for (const line of buffer.split("\n")) {
            processLine(line);
            if (streamSawDone) break;
          }
        }

        if (req.signal.aborted) throw new DOMException("Client aborted", "AbortError");
        if (!streamSawDone && !streamSawFinishReason) {
          throw new Error("OpenRouter stream ended before completion");
        }

        const output = {
          response: accumulated.trim(),
          model,
          provider: OPENROUTER_PROVIDER,
          durationMs: Date.now() - startedAt,
          generatedAt: new Date().toISOString(),
          followUpQuestions: [],
          uncertainties: accumulated.trim() ? [] : ["The model returned an empty streamed response."],
        };

        if (!req.signal.aborted) {
          try { emit("final", { output, meta: { requestedModel, resolvedModel: model } }); } catch { /* client disconnected after provider completion */ }
        }
        await logUsage(user.id, OPENROUTER_PROVIDER, model, collectUsage(), Date.now() - startedAt);
      } catch (err) {
        cancelUpstream();
        const errorMessage = err instanceof Error ? err.message : "Streaming failed";
        const isAbort = req.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
        if (!isAbort) {
          try { emit("error", { message: errorMessage }); } catch { /* client disconnected */ }
        }
        const observedUsage = collectUsage();
        await logUsage(
          user.id,
          OPENROUTER_PROVIDER,
          model,
          markIncompleteUsage(observedUsage),
          Date.now() - startedAt,
          isAbort ? "cancelled" : "error",
          isAbort ? "client_abort" : "stream_error",
        );
      } finally {
        req.signal.removeEventListener("abort", clientAbortHandler);
        cancelUpstream();
        try { await reader?.cancel(); } catch { /* already closed */ }
        reader?.releaseLock();
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
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
