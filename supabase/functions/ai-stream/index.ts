// Supabase Edge Function: streaming Ask proxy for DebateLab.
// Keeps provider keys server-side and uses SSE for progressive UI rendering.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAskModeGuidance } from "../ai/prompt-builder.ts";
import { isAskStreamingModeAllowed, validateControlInput } from "../_shared/control-enforcement.ts";
import { buildStreamingAskSystemPrompt } from "../_shared/prompts.ts";
import {
  markIncompleteUsage,
  normalizeOpenRouterUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, logUsage } from "../_shared/entitlements.ts";
import {
  DEFAULT_MODEL,
  effectiveReasoningEffort,
  getModelCatalogEntry,
  isReasoningEffort,
  MAX_REQUEST_OUTPUT_TOKENS,
  type ModelCatalogEntry,
  type ReasoningEffort,
} from "../_shared/model-catalog.ts";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_INPUT_LENGTH = 50000;
const MAX_HISTORY_ITEMS = 8;
const OPENROUTER_PROVIDER = "openrouter" as const;

function modelForRequest(model: string): ModelCatalogEntry | undefined {
  return getModelCatalogEntry(model);
}

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

export function buildMessages(message: string, history: ChatMessage[], mode: string) {
  const system = buildStreamingAskSystemPrompt(getAskModeGuidance(mode));
  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: message },
  ];
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

  const model = sanitizeText(body.model, 80) || DEFAULT_MODEL;
  const modelEntry = modelForRequest(model);
  if (!modelEntry) return jsonResponse({ error: "Unsupported model or provider combination" }, 400, corsHeaders);
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

  const rateLimit = await checkRateLimit(user.id, model);
  if (!rateLimit.allowed) {
    return jsonResponse({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current,
    }, rateLimit.statusCode || 402, corsHeaders);
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
        const messages = buildMessages(userMessage, history, mode);

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
          try { emit("final", { output }); } catch { /* client disconnected after provider completion */ }
        }
        await logUsage(user.id, "ask", OPENROUTER_PROVIDER, model, collectUsage(), Date.now() - startedAt);
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
          "ask",
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
