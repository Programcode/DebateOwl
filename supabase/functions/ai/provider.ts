// OpenRouter calls, JSON parsing with one repair retry, and the shared
// request budget.

import {
  mergeNormalizedUsage,
  normalizeOpenRouterUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  getModelCatalogEntry,
  MAX_REQUEST_OUTPUT_TOKENS,
  type ModelCatalogEntry,
  type ReasoningEffort,
} from "../_shared/model-catalog.ts";
import {
  fetchJsonWithTimeout,
  fetchWithTimeoutAndConsume,
  MAX_PROVIDER_ERROR_BODY_BYTES,
  MAX_PROVIDER_ERROR_BODY_CHARS,
  MAX_PROVIDER_RESPONSE_BYTES,
  OPENROUTER_API_URL,
  type Provider,
  readResponseText,
} from "../_shared/research.ts";
import { withPromptCaching } from "../_shared/prompt-budget.ts";
import { openRouterProviderOptions, providerRequestError, warnIfClaudeNotByok } from "../_shared/provider-routing.ts";

export const OPENROUTER_PROVIDER: Provider = "openrouter";

export function modelForRequest(model: string): ModelCatalogEntry {
  const entry = getModelCatalogEntry(model);
  if (!entry) throw new Error("Unsupported model or provider combination");
  return entry;
}

export class InvalidJsonResponseError extends Error {
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
export function parseProviderContent(
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

export function parseJsonFromText(text: string, providerName: string) {
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

export interface AIResult {
  output: unknown;
  usage?: NormalizedUsage;
}

/**
 * Receives a main provider call's text as the model writes it. Only the
 * call whose output the user sees takes one; research sub-calls never do.
 */
export interface GenerationStream {
  /** Raw model text, in order, exactly as the provider sent it. */
  delta: (text: string) => void;
  /** The text so far is void: a repair retry starts the answer again. */
  reset: () => void;
  /** The request moved to a step that writes nothing yet. */
  phase: (name: GenerationPhase) => void;
}

export type GenerationPhase = "research" | "writing" | "checking";

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: unknown;
};

export function normalizeProviderUsage(usage: unknown): NormalizedUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  return normalizeOpenRouterUsage(usage as Record<string, unknown>);
}

export function missingOpenRouterUsage(reason: string): NormalizedUsage {
  return { incomplete: true, raw: { openrouter_usage_missing: reason } };
}

export function attachMissingUsage(error: unknown, reason: string): unknown {
  if (!error || typeof error !== "object") return error;
  const errorWithUsage = error as { usage?: NormalizedUsage };
  if (!errorWithUsage.usage) errorWithUsage.usage = missingOpenRouterUsage(reason);
  return error;
}

export async function callAI(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal,
  stream?: GenerationStream,
): Promise<AIResult> {
  try {
    return await callAIOnce(provider, model, systemPrompt, messages, reasoningEffort, signal, stream);
  } catch (err) {
    if (!(err instanceof InvalidJsonResponseError)) throw attachMissingUsage(err, "call");

    console.warn(`[AI] ${err.providerName} returned invalid JSON; retrying with repair prompt`);
    stream?.reset();
    let retry: AIResult;
    try {
      retry = await callAIOnce(
        provider,
        model,
        `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: Return only valid JSON matching this schema, no prose.`,
        withJsonRepairPrompt(messages),
        reasoningEffort,
        signal,
        stream,
      );
    } catch (retryError) {
      // Preserve the completed first attempt if cancellation or another
      // failure prevents the repair attempt from returning a result.
      const retryUsage = retryError && typeof retryError === "object" && "usage" in retryError
        ? (retryError as { usage?: NormalizedUsage }).usage ?? missingOpenRouterUsage("repair_retry")
        : missingOpenRouterUsage("repair_retry");
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
      throw attachMissingUsage(retryError, "repair_retry");
    }
    // The failed attempt still consumed tokens; bill both.
    return {
      output: retry.output,
      usage: mergeNormalizedUsage([err.usage, retry.usage]),
    };
  }
}

export function withJsonRepairPrompt(messages: Array<{ role: string; content: string }>) {
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

export async function callAIOnce(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal,
  stream?: GenerationStream,
): Promise<AIResult> {
  if (provider !== OPENROUTER_PROVIDER) throw new Error(`Unsupported provider: ${provider}`);
  return await callOpenRouter(
    [{ role: "system", content: systemPrompt }, ...messages],
    model,
    reasoningEffort,
    signal,
    stream,
  );
}

// Supabase answers 504 when a function has not responded within 150 s. Every
// provider call shares one budget below that, so a slow model can use the time
// research left instead of a fixed 60 s. The margin covers the post-generation
// source-usage check (its own 8 s Jev timeout), logging, and saving.
export const REQUEST_BUDGET_MS = 130_000;

export function createRequestBudgetSignal(
  requestSignal: AbortSignal,
  deadlineSignal = AbortSignal.timeout(REQUEST_BUDGET_MS),
): AbortSignal {
  return AbortSignal.any([requestSignal, deadlineSignal]);
}

export async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal,
  stream?: GenerationStream,
): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const modelEntry = modelForRequest(model);
  const payload: Record<string, unknown> = {
    model,
    messages: withPromptCaching(model, messages),
    max_tokens: Math.min(modelEntry.maxTokens, MAX_REQUEST_OUTPUT_TOKENS),
    response_format: { type: "json_object" },
    reasoning: { effort: reasoningEffort, exclude: true },
    provider: openRouterProviderOptions(model),
  };
  if (stream) return await streamOpenRouter(apiKey, model, payload, stream, signal);

  const { response, data, errorBody } = await fetchJsonWithTimeout<OpenRouterResponse>(`${OPENROUTER_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  }, REQUEST_BUDGET_MS, signal);
  if (!response.ok) {
    console.error(`[OpenRouter] Request failed (${response.status}):`, errorBody?.slice(0, 2000));
    throw providerRequestError(model, response.status);
  }
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) throw new Error("OpenRouter returned no choices");
  const usage = normalizeProviderUsage(data.usage) ?? missingOpenRouterUsage("response");
  warnIfClaudeNotByok(model, usage.raw, "ai");
  return parseProviderContent(data.choices[0]?.message?.content ?? "", "OpenRouter", usage);
}

// A streamed reply wraps every token in a JSON frame (ids, model, provider,
// timestamps), so its raw size is many times the answer's. The answer keeps
// the plain reply's cap; the frames get room for that overhead.
const MAX_STREAM_FRAME_OVERHEAD = 32;

type OpenRouterStreamChunk = {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
  usage?: unknown;
  error?: unknown;
};

/**
 * The same request as callOpenRouter with `stream: true`. Each content token
 * goes to the sink as it arrives; the joined text is then parsed exactly like
 * a non-streamed reply, so the result the caller sees does not change.
 */
async function streamOpenRouter(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
  stream: GenerationStream,
  signal?: AbortSignal,
): Promise<AIResult> {
  stream.phase("writing");
  const { text, usage } = await fetchWithTimeoutAndConsume(`${OPENROUTER_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ ...payload, stream: true, stream_options: { include_usage: true } }),
  }, REQUEST_BUDGET_MS, signal, async (response, bodySignal) => {
    if (!response.ok || !response.body) {
      const body = response.body
        ? await readResponseText(response, MAX_PROVIDER_ERROR_BODY_BYTES, MAX_PROVIDER_ERROR_BODY_CHARS, bodySignal, true)
        : { text: "" };
      console.error(`[OpenRouter] Stream request failed (${response.status}):`, body.text.slice(0, 2000));
      throw providerRequestError(model, response.status);
    }
    return await readOpenRouterStream(response.body, stream, bodySignal, model);
  });
  warnIfClaudeNotByok(model, usage.raw, "ai");
  return parseProviderContent(text, "OpenRouter", usage);
}

export async function readOpenRouterStream(
  body: ReadableStream<Uint8Array>,
  stream: GenerationStream,
  signal: AbortSignal,
  model = "",
): Promise<{ text: string; usage: NormalizedUsage }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let totalBytes = 0;
  let textBytes = 0;
  const encoder = new TextEncoder();
  let usageRaw: Record<string, unknown> | undefined;
  let done = false;
  let finished = false;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    // OpenRouter sends `: OPENROUTER PROCESSING` comments while a model thinks.
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice("data:".length).trim();
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let chunk: OpenRouterStreamChunk;
    try { chunk = JSON.parse(data); } catch { return; }
    if (chunk.error) {
      const message = typeof chunk.error === "object" && chunk.error !== null && "message" in chunk.error
        ? (chunk.error as { message?: unknown }).message
        : chunk.error;
      console.error("[OpenRouter] Stream error:", typeof message === "string" ? message.slice(0, 2000) : "stream error");
      throw providerRequestError(model, null, text.length > 0);
    }
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) finished = true;
    const content = choice?.delta?.content;
    if (typeof content === "string" && content) {
      text += content;
      textBytes += encoder.encode(content).byteLength;
      if (textBytes > MAX_PROVIDER_RESPONSE_BYTES) throw new Error(`Provider response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
      stream.delta(content);
    }
    if (chunk.usage && typeof chunk.usage === "object" && !Array.isArray(chunk.usage)) {
      usageRaw = { ...usageRaw, ...(chunk.usage as Record<string, unknown>) };
    }
  };

  try {
    while (!done) {
      if (signal.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      const { done: ended, value } = await reader.read();
      if (ended) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES * MAX_STREAM_FRAME_OVERHEAD) {
        throw new Error(`Provider stream exceeds ${MAX_PROVIDER_RESPONSE_BYTES * MAX_STREAM_FRAME_OVERHEAD} bytes`);
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
        if (done) break;
      }
    }
    if (!done) {
      buffer += decoder.decode();
      for (const line of buffer.split("\n")) {
        processLine(line);
        if (done) break;
      }
    }
  } catch (error) {
    // Tokens already arrived are billed even though the answer is lost.
    if (error && typeof error === "object") {
      (error as { usage?: NormalizedUsage }).usage = usageRaw
        ? { ...normalizeOpenRouterUsage(usageRaw), incomplete: true }
        : missingOpenRouterUsage("stream");
    }
    throw error;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (!done && !finished) {
    const error = new Error("OpenRouter stream ended before completion") as Error & { usage?: NormalizedUsage };
    error.usage = usageRaw ? { ...normalizeOpenRouterUsage(usageRaw), incomplete: true } : missingOpenRouterUsage("stream");
    throw error;
  }
  return { text, usage: usageRaw ? normalizeOpenRouterUsage(usageRaw) : missingOpenRouterUsage("stream") };
}
