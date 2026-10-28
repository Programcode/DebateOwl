// AI usage limits that are expected to change while pricing is settled.
// Change the numbers here; checkRateLimit in entitlements.ts reads them.
// Per-user daily limits still come from the tier defaults, daily_limit_override
// and rate_limits rows; these values decide how fast a request uses them up.

import { AUTO_FAST, AUTO_PRO, type ModelSelection } from "./model-catalog.ts";
import { FAST_CANDIDATES, PRO_CANDIDATES } from "./auto-model-router.ts";

/** Quota units a model without an entry below costs. */
export const DEFAULT_QUOTA_UNITS = 1;

/**
 * How many daily requests one call to a model counts as. Unlisted models
 * cost DEFAULT_QUOTA_UNITS.
 */
const MODEL_UNITS: Readonly<Record<string, number>> = {
  "anthropic/claude-opus-5.5": 5,
  "openai/gpt-6.1-sol": 3,
  "anthropic/claude-sonnet-5.5": 2,
  "deepseek/deepseek-v4-pro-0813": 2,
};

const modelUnits = (model: string) => MODEL_UNITS[model] ?? DEFAULT_QUOTA_UNITS;

/**
 * The quota is reserved before Auto picks a model, so an Auto selection costs
 * its most expensive candidate. Derived from the pools, so a pool change
 * (Auto Pro dropping Opus) cannot leave Auto charging for a model it no
 * longer uses.
 */
export const MODEL_QUOTA_UNITS: Readonly<Record<string, number>> = {
  ...MODEL_UNITS,
  [AUTO_PRO]: Math.max(...Object.keys(PRO_CANDIDATES).map(modelUnits)),
  [AUTO_FAST]: Math.max(...Object.keys(FAST_CANDIDATES).map(modelUnits)),
};

/**
 * Weekly cap on a user's AI spend, in USD, per calendar week starting Monday
 * 00:00 UTC. Only ai_requests.cap_cost_usd counts: the full logged cost of
 * each request, including Claude calls billed to our own BYOK Anthropic key,
 * plus Exa and ElevenLabs. Set to null to turn the cap off for everyone. One
 * account's cap is changed or lifted in user_settings (weekly_budget_override_usd,
 * weekly_budget_unlimited); see getWeeklyBudgetUsd in entitlements.ts.
 */
export const WEEKLY_AI_BUDGET_USD: number | null = 2;

/** Default daily quota units per tier, before overrides and rate_limits rows. */
export const TRIAL_DAILY_LIMIT = 5;
export const PRO_DAILY_LIMIT = 50;

export function quotaUnitsFor(model: ModelSelection | string | undefined): number {
  if (!model) return DEFAULT_QUOTA_UNITS;
  return MODEL_QUOTA_UNITS[model] ?? DEFAULT_QUOTA_UNITS;
}

/**
 * Features charged once per session instead of once per AI call: one
 * Crossfire round (opening turn, every answer, the debrief) or one Sparring
 * round (every opponent reply and the judge) costs the model's units once.
 * A session that runs past maxCalls calls or ttlSeconds since it paid is
 * charged again, so a reused session id cannot buy unlimited AI. A Crossfire
 * transcript holds at most 20 AI turns plus the debrief; a Sparring round has
 * at most 4 opponent replies plus the judge. The rest is room for retries.
 * Sparring rounds can be paused for hours, so they live longer.
 */
export const SESSION_QUOTA: Readonly<Record<"crossfire" | "sparring", { maxCalls: number; ttlSeconds: number }>> = {
  crossfire: { maxCalls: 30, ttlSeconds: 2 * 60 * 60 },
  sparring: { maxCalls: 12, ttlSeconds: 12 * 60 * 60 },
};

/**
 * A run the browser left (reload, Stop, a dropped connection) is refunded
 * unless the user already saw this many characters of its streamed output.
 * Below it the run produced nothing usable; at or above it the user may have
 * read an answer, so it stays charged. In the ai function a run that failed
 * on the server is refunded however much streamed; ai-stream's plain-text Ask
 * applies this limit whatever ended the run.
 */
export const REFUND_MAX_DELIVERED_CHARS = 200;
