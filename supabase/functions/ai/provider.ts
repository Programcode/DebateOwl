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
import { fetchJsonWithTimeout, OPENROUTER_API_URL, type Provider } from "../_shared/research.ts";

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
  signal?: AbortSignal
): Promise<AIResult> {
  try {
    return await callAIOnce(provider, model, systemPrompt, messages, reasoningEffort, signal);
  } catch (err) {
    if (!(err instanceof InvalidJsonResponseError)) throw attachMissingUsage(err, "call");

    console.warn(`[AI] ${err.providerName} returned invalid JSON; retrying with repair prompt`);
    let retry: AIResult;
    try {
      retry = await callAIOnce(
        provider,
        model,
        `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: Return only valid JSON matching this schema, no prose.`,
        withJsonRepairPrompt(messages),
        reasoningEffort,
        signal,
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
  signal?: AbortSignal
): Promise<AIResult> {
  if (provider !== OPENROUTER_PROVIDER) throw new Error(`Unsupported provider: ${provider}`);
  return await callOpenRouter(
    [{ role: "system", content: systemPrompt }, ...messages],
    model,
    reasoningEffort,
    signal,
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
): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const modelEntry = modelForRequest(model);
  const payload: Record<string, unknown> = {
    model,
    messages,
    max_tokens: Math.min(modelEntry.maxTokens, MAX_REQUEST_OUTPUT_TOKENS),
    response_format: { type: "json_object" },
    reasoning: { effort: reasoningEffort, exclude: true },
    // Omitting sort and order keeps OpenRouter's balanced provider load balancing.
    provider: { require_parameters: true },
  };

  const { response, data, errorBody } = await fetchJsonWithTimeout<OpenRouterResponse>(`${OPENROUTER_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  }, REQUEST_BUDGET_MS, signal);
  if (!response.ok) throw new Error(`OpenRouter error: ${errorBody ?? ""}`);
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) throw new Error("OpenRouter returned no choices");
  const usage = normalizeProviderUsage(data.usage) ?? missingOpenRouterUsage("response");
  return parseProviderContent(data.choices[0]?.message?.content ?? "", "OpenRouter", usage);
}
