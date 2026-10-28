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
  /** One Sparring opponent speech: up to 7 minutes, 6,000 characters. */
  sparringSpeech: 2_500,
  /** The Sparring scorecard: four categories, moments, areas, verdict. */
  sparringScore: 3_000,
  /**
   * A full case, any length setting. Claude Haiku can write past 6,000 on a
   * comprehensive case; a cut-off reply is then written again from the start
   * at twice the cap, which took Auto Fast cases past the function's time
   * limit. The cap only bounds the reply, so room costs nothing unless used.
   */
  generate: 12_000,
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
 * The percentage of max_tokens a budget-based model (Claude) may spend on
 * reasoning at each effort. OpenRouter sets its budget to
 * max(max_tokens * share, 1024).
 * https://openrouter.ai/docs/use-cases/reasoning-tokens
 */
const REASONING_SHARE_PERCENT: Record<ReasoningEffort, number> = { low: 20, medium: 50, high: 80 };

/**
 * Reasoning room kept on top of the reply at each effort. Effort-based models
 * (OpenAI, Gemini 3, DeepSeek) decide how long they think and take no budget,
 * so this is a floor sized for them; a reply that still runs out is retried.
 * The low floor also stays above Claude's 1024-token minimum budget.
 */
const REASONING_HEADROOM: Record<ReasoningEffort, number> = { low: 2_048, medium: 4_096, high: 8_192 };

/**
 * The max_tokens to send so the reply keeps `replyTokens` after reasoning:
 * after Claude's full budget, and after the headroom for every other model.
 * Bounded by the model's own limit.
 */
export function outputTokenLimit(
  replyTokens: number,
  effort: ReasoningEffort,
  modelMaxTokens: number,
): number {
  const afterBudget = Math.ceil((replyTokens * 100) / (100 - REASONING_SHARE_PERCENT[effort]));
  return Math.min(modelMaxTokens, Math.max(afterBudget, replyTokens + REASONING_HEADROOM[effort]));
}
