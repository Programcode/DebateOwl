// Shared model cost calculator. Fails closed: unknown pricing yields
// costUsd = null, never an invented estimate. Raw provider usage is preserved
// so every billing-relevant field stays auditable.

// v2 adds the upstream charge OpenRouter reports for BYOK calls, which v1
// logged as $0, and the Exa charges merged into a request's research.
export const OPENROUTER_COST_CALCULATION_VERSION = "openrouter-usage-v2";

export const EXA_PROVIDER = "exa";

export const ELEVENLABS_PROVIDER = "elevenlabs";
export const ELEVENLABS_COST_CALCULATION_VERSION = "elevenlabs-characters-v1";
export const ELEVENLABS_PRICING_SNAPSHOT_ID = "elevenlabs-api-pricing-2026-10-01";
export const ELEVENLABS_PRICING_SOURCE_URL = "https://elevenlabs.io/pricing/api";
// USD per 1,000 billed characters at list price on the snapshot date.
// ElevenLabs reports characters, not dollars, so this is the one place a
// price table remains. Promotions and plan credits are not modelled: a row
// can overstate the charge, never understate it.
const ELEVENLABS_USD_PER_1K_CHARACTERS: Record<string, number> = {
  eleven_v4: 0.08,
  eleven_v4_turbo: 0.04,
};

export interface NormalizedUsage {
  /** True when part of the request's provider work was not observed to settle. */
  incomplete?: boolean;
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
  /** OpenRouter's authoritative account charge, in USD. */
  reportedCostUsd?: number;
  /**
   * The part of reportedCostUsd that counts toward the weekly spend cap. For
   * OpenRouter it is `usage.cost`, what OpenRouter took from our credits; a
   * BYOK call billed to our own provider key adds only OpenRouter's fee.
   * Undefined means "same as reportedCostUsd" (Exa, ElevenLabs, merged calls
   * that did not set it).
   */
  capCostUsd?: number;
  /** Characters ElevenLabs billed for a speech request. */
  billedCharacters?: number;
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
  /** USD that counts toward the weekly spend cap; null when unknown. */
  capCostUsd: number | null;
  pricingSnapshotId: string;
  pricingSourceUrl: string | null;
  costCalculationVersion: string;
  rawUsage?: Record<string, unknown>;
}

function intOrUndefined(value: unknown): number | undefined {
  // Negative token counts are provider anomalies; drop them rather than bill them.
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function reportedCostOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * OpenRouter's `cost` is what it charged the account. With a provider key
 * attached (BYOK, `is_byok: true`) that is only its fee, often 0, and the
 * provider bills our own key for `cost_details.upstream_inference_cost`. The
 * real cost is the sum. A BYOK response without the upstream figure stays
 * unpriced rather than logging the fee alone as the whole bill.
 */
function openRouterCostOrUndefined(usage: Record<string, unknown>): number | undefined {
  const fee = reportedCostOrUndefined(usage.cost);
  if (usage.is_byok !== true || fee === undefined) return fee;
  const upstream = reportedCostOrUndefined(asRecord(usage.cost_details)?.upstream_inference_cost);
  return upstream === undefined ? undefined : fee + upstream;
}

export function normalizeOpenRouterUsage(usage: Record<string, unknown>): NormalizedUsage {
  const promptDetails = asRecord(usage.prompt_tokens_details);
  const completionDetails = asRecord(usage.completion_tokens_details);
  return {
    inputTokens: intOrUndefined(usage.prompt_tokens),
    cachedInputTokens: intOrUndefined(promptDetails?.cached_tokens),
    cacheWriteTokens: intOrUndefined(promptDetails?.cache_write_tokens),
    outputTokens: intOrUndefined(usage.completion_tokens),
    reasoningOutputTokens: intOrUndefined(completionDetails?.reasoning_tokens),
    // The logged charge: for a BYOK call, OpenRouter's fee plus what the
    // provider billed our key (calculator v2).
    reportedCostUsd: openRouterCostOrUndefined(usage),
    // usage.cost is OpenRouter's credit charge. For a BYOK call it is only the
    // OpenRouter fee, so Claude on our own Anthropic key stays out of the cap,
    // and a call that fell back to OpenRouter credits counts in full.
    capCostUsd: reportedCostOrUndefined(usage.cost),
    raw: usage,
  };
}

/**
 * Exa reports each call's charge as `costDollars.total`. The usage joins the
 * request's research usage, so the parent ai_requests row carries the cost
 * and `raw_usage.calls` keeps one entry per Exa call. A successful response
 * without a charge is incomplete: the call was billed, the amount is unknown.
 */
export function normalizeExaUsage(endpoint: "search" | "contents", data: unknown): NormalizedUsage {
  const body = asRecord(data);
  const costDollars = asRecord(body?.costDollars);
  const total = reportedCostOrUndefined(costDollars?.total);
  return {
    incomplete: total === undefined || undefined,
    reportedCostUsd: total,
    raw: {
      provider: EXA_PROVIDER,
      endpoint,
      request_id: typeof body?.requestId === "string" ? body.requestId : null,
      cost_dollars: costDollars ?? null,
    },
  };
}

/**
 * ElevenLabs bills per input character and reports the count in the
 * `character-cost` response header. Without a usable header, the characters
 * sent are the documented basis for the charge.
 */
export function normalizeElevenLabsUsage(args: {
  characters: number;
  characterCostHeader: string | null;
  requestId: string | null;
}): NormalizedUsage {
  const reported = args.characterCostHeader !== null && /^\d+$/.test(args.characterCostHeader.trim())
    ? Number(args.characterCostHeader.trim())
    : undefined;
  return {
    billedCharacters: reported ?? args.characters,
    raw: {
      characters: args.characters,
      character_cost: args.characterCostHeader,
      request_id: args.requestId,
    },
  };
}

function calculateElevenLabsCost(model: string, usage?: NormalizedUsage): CostResult {
  const rate = ELEVENLABS_USD_PER_1K_CHARACTERS[model];
  const characters = usage?.billedCharacters;
  const result: CostResult = {
    inputTokens: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    // An unlisted model or an unknown character count stays unpriced.
    costUsd: rate === undefined || characters === undefined || usage?.incomplete
      ? null
      : Number(((characters / 1_000) * rate).toFixed(6)),
    capCostUsd: null,
    pricingSnapshotId: ELEVENLABS_PRICING_SNAPSHOT_ID,
    pricingSourceUrl: rate === undefined ? null : ELEVENLABS_PRICING_SOURCE_URL,
    costCalculationVersion: ELEVENLABS_COST_CALCULATION_VERSION,
  };
  // ElevenLabs bills our own account, so all of it counts toward the cap.
  result.capCostUsd = result.costUsd;
  if (usage?.raw) result.rawUsage = usage.raw;
  return result;
}

/** Cap spend for one usage record: its own cap figure, else its full reported cost. */
function capCostOf(usage: NormalizedUsage): number | undefined {
  return usage.capCostUsd ?? usage.reportedCostUsd;
}

export function calculateRequestCost(args: {
  provider: string;
  model: string;
  usage?: NormalizedUsage;
}): CostResult {
  const { usage } = args;
  if (args.provider === ELEVENLABS_PROVIDER) return calculateElevenLabsCost(args.model, usage);
  // Cache writes report the combined 5m + 1h total for storage; raw_usage
  // keeps the exact TTL split for audit.
  const combinedCacheWrite = usage?.cacheWriteTokens !== undefined || usage?.cacheWrite1hTokens !== undefined
    ? (usage?.cacheWriteTokens ?? 0) + (usage?.cacheWrite1hTokens ?? 0)
    : undefined;

  // OpenRouter is the only provider the app routes through, and it reports the
  // authoritative account charge per response. Incomplete work stays unpriced
  // rather than publishing a lower bound.
  const result: CostResult = {
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    cacheWriteTokens: combinedCacheWrite ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningOutputTokens: usage?.reasoningOutputTokens ?? null,
    costUsd: usage?.incomplete ? null : usage?.reportedCostUsd ?? null,
    // The cap counts what is known even when the rest of the cost is not: a
    // lower bound stops a user sooner than leaving the request out entirely.
    capCostUsd: usage ? capCostOf(usage) ?? null : null,
    pricingSnapshotId: "openrouter-response-usage",
    pricingSourceUrl: "https://openrouter.ai/docs/cookbook/administration/usage-accounting",
    costCalculationVersion: OPENROUTER_COST_CALCULATION_VERSION,
  };
  if (usage?.raw) result.rawUsage = usage.raw;
  return result;
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
    incomplete: defined.some((u) => u.incomplete === true) || undefined,
    inputTokens: sum(defined.map((u) => u.inputTokens)),
    cachedInputTokens: sum(defined.map((u) => u.cachedInputTokens)),
    cacheWriteTokens: sum(defined.map((u) => u.cacheWriteTokens)),
    cacheWrite1hTokens: sum(defined.map((u) => u.cacheWrite1hTokens)),
    outputTokens: sum(defined.map((u) => u.outputTokens)),
    reasoningOutputTokens: sum(defined.map((u) => u.reasoningOutputTokens)),
    reportedCostUsd: defined.every((u) => !u.incomplete && typeof u.reportedCostUsd === "number")
      ? defined.reduce((total, usage) => total + (usage.reportedCostUsd ?? 0), 0)
      : undefined,
    // Cap spend is a lower bound: calls with an unknown charge add nothing.
    capCostUsd: defined.some((u) => typeof capCostOf(u) === "number")
      ? defined.reduce((total, usage) => total + (capCostOf(usage) ?? 0), 0)
      : undefined,
    raw: { calls: defined.map((u) => u.raw ?? null) },
  };
  return merged;
}

/**
 * Selects the one usage record that best represents observed provider work.
 * A non-aborted error prefers the merged usage on `usage`. An aborted error
 * prefers completed work on `completedUsage` unless the merged usage is
 * incomplete, because that marker must keep the total cost unknown.
 */
export function selectObservedUsage(
  usageError: { usage?: NormalizedUsage; completedUsage?: NormalizedUsage } | undefined,
  aborted: boolean,
): NormalizedUsage | undefined {
  if (aborted && usageError?.usage?.incomplete) return usageError.usage;
  return aborted
    ? usageError?.completedUsage ?? usageError?.usage
    : usageError?.usage ?? usageError?.completedUsage;
}

/** Preserve observed fragments without treating partial provider work as a complete bill. */
export function markIncompleteUsage(usage?: NormalizedUsage): NormalizedUsage {
  return { ...usage, incomplete: true };
}
