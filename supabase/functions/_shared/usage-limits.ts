// AI usage limits that are expected to change while pricing is settled.
// Change the numbers here; checkRateLimit in entitlements.ts reads them.
// Per-user daily limits still come from the tier defaults, daily_limit_override
// and rate_limits rows; these values decide how fast a request uses them up.

import { AUTO_FAST, AUTO_PRO, type ModelSelection } from "./model-catalog.ts";

/** Quota units a model without an entry below costs. */
export const DEFAULT_QUOTA_UNITS = 1;

/**
 * How many daily requests one call to a model counts as. Unlisted models
 * cost DEFAULT_QUOTA_UNITS. The quota is reserved before Auto picks a model,
 * so Auto selections are charged as their most expensive candidate.
 */
export const MODEL_QUOTA_UNITS: Readonly<Record<string, number>> = {
  "anthropic/claude-opus-5.5": 5,
  "openai/gpt-6.1-sol": 3,
  "anthropic/claude-sonnet-5.5": 2,
  "deepseek/deepseek-v4-pro-0813": 2,
  [AUTO_PRO]: 5,
  [AUTO_FAST]: 1,
};

/**
 * Weekly cap on a user's AI spend, in USD, per calendar week starting Monday
 * 00:00 UTC. Only ai_requests.cap_cost_usd counts: OpenRouter credit charges
 * plus Exa and ElevenLabs. Calls billed to our own BYOK key (Claude on the
 * Anthropic Max plan) add only OpenRouter's fee, usually 0. Set to null to
 * turn the cap off.
 */
export const WEEKLY_AI_BUDGET_USD: number | null = 2;

/** Default daily quota units per tier, before overrides and rate_limits rows. */
export const TRIAL_DAILY_LIMIT = 5;
export const PRO_DAILY_LIMIT = 50;

export function quotaUnitsFor(model: ModelSelection | string | undefined): number {
  if (!model) return DEFAULT_QUOTA_UNITS;
  return MODEL_QUOTA_UNITS[model] ?? DEFAULT_QUOTA_UNITS;
}
