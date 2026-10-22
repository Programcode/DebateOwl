import type { ReasoningEffort } from "./model-catalog.ts";

/**
 * How long each AI reply may be. Change the numbers here; every provider call
 * picks its cap from this table.
 *
 * Each value is the visible reply budget in tokens. The request's max_tokens
 * adds room for hidden reasoning on top (see outputTokenLimit), because
 * OpenRouter counts reasoning and reply against the same limit.
 */
export const REPLY_TOKEN_CAPS = {
  /** Ask, both the streamed chat and the structured JSON modes. */
  ask: 1_500,
  /** One Crossfire question or answer. */
  crossfireTurn: 1_000,
  /** The turn-cited Crossfire debrief: six arrays of findings. */
  crossfireDebrief: 2_000,
  /** One Sparring opponent speech. */
  sparringSpeech: 1_500,
  /** The Sparring scorecard: four categories, moments, areas, verdict. */
  sparringScore: 2_000,
  /** A full case, any length setting. */
  generate: 6_000,
  attack: 4_000,
  brainstorm: 4_000,
  factoids: 4_000,
  /** Research sub-calls: the search decision and follow-up queries. */
  research: 400,
} as const;

export type ReplyCap = keyof typeof REPLY_TOKEN_CAPS;

/**
 * A reply cut off at its cap is retried once with this many times the budget.
 * Truncated JSON cannot be parsed, so the retry is the only way to save it.
 */
export const TRUNCATION_RETRY_FACTOR = 2;

/**
 * The share of max_tokens a provider may spend on reasoning at each effort,
 * and the smallest reasoning budget it allows. These mirror OpenRouter's
 * conversion for budget-based models (Anthropic, Gemini):
 * budget = max(max_tokens * share, 1024).
 * https://openrouter.ai/docs/use-cases/reasoning-tokens
 */
const REASONING_SHARE: Record<ReasoningEffort, number> = { low: 0.2, medium: 0.5, high: 0.8 };
const MIN_REASONING_TOKENS = 1_024;

/**
 * The max_tokens to send so the provider's full reasoning allowance still
 * leaves `replyTokens` for the visible reply, bounded by the model's limit.
 */
export function outputTokenLimit(
  replyTokens: number,
  effort: ReasoningEffort,
  modelMaxTokens: number,
): number {
  const withShare = Math.ceil(replyTokens / (1 - REASONING_SHARE[effort]));
  return Math.min(modelMaxTokens, Math.max(withShare, replyTokens + MIN_REASONING_TOKENS));
}
