// Shared model cost calculator. Fails closed: unknown pricing yields
// costUsd = null, never an invented estimate. Raw provider usage is preserved
// so every billing-relevant field stays auditable.

import {
  PRICING_SNAPSHOT_ID,
  PRICING_SOURCE_URLS,
  findModelPricing,
  type PricingProvider,
} from "./model-pricing.ts";

export const COST_CALCULATION_VERSION = "cost-calc-v1";

export interface NormalizedUsage {
  /** Provider-reported input/prompt tokens (includes cached tokens for OpenAI and Google). */
  inputTokens?: number;
  /** Cached input reads: OpenAI cached subset, Anthropic cache hits, Google cached content. */
  cachedInputTokens?: number;
  /** Anthropic 5-minute cache write tokens. */
  cacheWriteTokens?: number;
  /** Anthropic 1-hour cache write tokens. */
  cacheWrite1hTokens?: number;
  /** Billable output tokens. For Google this is candidates + thoughts; for OpenAI and Anthropic the provider already includes reasoning/thinking in output. */
  outputTokens?: number;
  /** Reported reasoning/thinking subset of outputTokens. Never billed twice. */
  reasoningOutputTokens?: number;
  /** Untouched provider usage object, kept verbatim for audit. */
  raw?: Record<string, unknown>;
}

export interface CostResult {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  /** null when the model has no verified pricing in the snapshot. */
  costUsd: number | null;
  pricingSnapshotId: string;
  pricingSourceUrl: string | null;
  costCalculationVersion: string;
  rawUsage?: Record<string, unknown>;
}

function intOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function normalizeOpenAIUsage(usage: Record<string, unknown>): NormalizedUsage {
  const promptDetails = asRecord(usage.prompt_tokens_details);
  const completionDetails = asRecord(usage.completion_tokens_details);
  return {
    inputTokens: intOrUndefined(usage.prompt_tokens),
    cachedInputTokens: intOrUndefined(promptDetails?.cached_tokens),
    outputTokens: intOrUndefined(usage.completion_tokens),
    reasoningOutputTokens: intOrUndefined(completionDetails?.reasoning_tokens),
    raw: usage,
  };
}

export function normalizeAnthropicUsage(usage: Record<string, unknown>): NormalizedUsage {
  // cache_creation_input_tokens can be a flat count or split by TTL.
  const creation = usage.cache_creation_input_tokens;
  let cacheWrite: number | undefined;
  let cacheWrite1h: number | undefined;
  if (typeof creation === "number") {
    cacheWrite = creation;
  } else if (asRecord(creation)) {
    const details = creation as Record<string, unknown>;
    cacheWrite = intOrUndefined(details.ephemeral_5m_input_tokens);
    cacheWrite1h = intOrUndefined(details.ephemeral_1h_input_tokens);
  }
  return {
    inputTokens: intOrUndefined(usage.input_tokens),
    cachedInputTokens: intOrUndefined(usage.cache_read_input_tokens),
    cacheWriteTokens: cacheWrite,
    cacheWrite1hTokens: cacheWrite1h,
    outputTokens: intOrUndefined(usage.output_tokens),
    raw: usage,
  };
}

export function normalizeGoogleUsage(usageMetadata: Record<string, unknown>): NormalizedUsage {
  const candidates = intOrUndefined(usageMetadata.candidatesTokenCount);
  const thoughts = intOrUndefined(usageMetadata.thoughtsTokenCount);
  const output = [candidates, thoughts].filter((n): n is number => typeof n === "number");
  return {
    inputTokens: intOrUndefined(usageMetadata.promptTokenCount),
    cachedInputTokens: intOrUndefined(usageMetadata.cachedContentTokenCount),
    outputTokens: output.length ? output.reduce((a, b) => a + b, 0) : undefined,
    reasoningOutputTokens: thoughts,
    raw: usageMetadata,
  };
}

function nonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function perMillion(tokens: number, rate: number): number {
  return (tokens / 1_000_000) * rate;
}

export function calculateRequestCost(args: {
  provider: PricingProvider | string;
  model: string;
  usage?: NormalizedUsage;
}): CostResult {  const { provider, model, usage } = args;
  const base: CostResult = {
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningOutputTokens: usage?.reasoningOutputTokens ?? null,
    costUsd: null,
    pricingSnapshotId: PRICING_SNAPSHOT_ID,
    pricingSourceUrl: PRICING_SOURCE_URLS[provider] ?? null,
    costCalculationVersion: COST_CALCULATION_VERSION,
  };
  if (usage?.raw) base.rawUsage = usage.raw;

  if (!usage || !usage.inputTokens && !usage.outputTokens) return base;

  const pricing = findModelPricing(provider, model);
  if (!pricing) {
    base.pricingSourceUrl = null;
    return base;
  }

  const longContext = typeof pricing.longContextThresholdTokens === "number" &&
    (usage.inputTokens ?? 0) > pricing.longContextThresholdTokens;

  const inputRate = longContext ? pricing.longContextInputPer1m ?? pricing.inputPer1m : pricing.inputPer1m;
  const outputRate = longContext ? pricing.longContextOutputPer1m ?? pricing.outputPer1m : pricing.outputPer1m;
  const cachedRate = longContext
    ? pricing.longContextCachedInputPer1m ?? pricing.cachedInputPer1m
    : pricing.cachedInputPer1m;
  // Unknown cached rate must not bill at $0; charge standard input instead.
  const effectiveCachedRate = typeof cachedRate === "number" ? cachedRate : inputRate;

  let cost = 0;
  const inputTokens = nonNegative(usage.inputTokens);

  if (provider === "anthropic") {
    // Anthropic reports cache reads/writes separately from base input.
    cost += perMillion(inputTokens, inputRate);
    cost += perMillion(nonNegative(usage.cachedInputTokens), effectiveCachedRate);
    cost += perMillion(nonNegative(usage.cacheWriteTokens), nonNegative(pricing.cacheWritePer1m));
    cost += perMillion(nonNegative(usage.cacheWrite1hTokens), nonNegative(pricing.cacheWrite1hPer1m));
  } else {
    // OpenAI and Google include cached tokens inside the reported prompt count.
    const cached = Math.min(nonNegative(usage.cachedInputTokens), inputTokens);
    const uncachedInput = inputTokens - cached;
    cost += perMillion(uncachedInput, inputRate);
    cost += perMillion(cached, effectiveCachedRate);
  }

  cost += perMillion(nonNegative(usage.outputTokens), outputRate);

  base.costUsd = Number.isFinite(cost) ? cost : null;
  return base;
}

/**
 * Merges usage from several provider calls (main answer + research sub-calls)
 * into one normalized record for a single ai_requests row. Raw payloads are
 * kept per call so the audit trail still shows how totals were produced.
 */
export function mergeNormalizedUsage(usages: Array<NormalizedUsage | undefined>): NormalizedUsage | undefined {
  const defined = usages.filter((u): u is NormalizedUsage => Boolean(u));
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];

  const sum = (values: Array<number | undefined>): number | undefined => {
    const nums = values.filter((v): v is number => typeof v === "number");
    return nums.length ? nums.reduce((a, b) => a + b, 0) : undefined;
  };

  const merged: NormalizedUsage = {
    inputTokens: sum(defined.map((u) => u.inputTokens)),
    cachedInputTokens: sum(defined.map((u) => u.cachedInputTokens)),
    cacheWriteTokens: sum(defined.map((u) => u.cacheWriteTokens)),
    cacheWrite1hTokens: sum(defined.map((u) => u.cacheWrite1hTokens)),
    outputTokens: sum(defined.map((u) => u.outputTokens)),
    reasoningOutputTokens: sum(defined.map((u) => u.reasoningOutputTokens)),
    raw: { calls: defined.map((u) => u.raw ?? null) },
  };
  return merged;
}
