// Normalized model pricing snapshot, sourced from official provider pricing pages.
// Regenerate with `npx tsx scripts/update-model-pricing.ts`; see docs/pricing-snapshots/metadata.json
// for retrieval timestamps, content hashes, and per-model findings.

export const PRICING_SNAPSHOT_ID = "official-docs-2026-08-22";

export const PRICING_SOURCE_URLS: Record<string, string> = {
  openai: "https://platform.openai.com/docs/pricing",
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  google: "https://ai.google.dev/gemini-api/docs/pricing",
};

export type PricingProvider = "openai" | "anthropic" | "google";

export interface ModelPricing {
  provider: PricingProvider;
  model: string;
  currency: "USD";
  /** Standard input price per 1M tokens. */
  inputPer1m: number;
  /** Output price per 1M tokens (includes reasoning/thinking tokens wherever the provider bills them as output). */
  outputPer1m: number;
  /** Price per 1M tokens for cached input reads: OpenAI cached input, Anthropic cache hits, Google context caching. */
  cachedInputPer1m?: number;
  /** Anthropic 5-minute cache write price per 1M tokens. */
  cacheWritePer1m?: number;
  /** Anthropic 1-hour cache write price per 1M tokens. */
  cacheWrite1hPer1m?: number;
  /** Prompt size above which the long-context rates apply. */
  longContextThresholdTokens?: number;
  longContextInputPer1m?: number;
  longContextCachedInputPer1m?: number;
  longContextOutputPer1m?: number;
}

// Every entry below was transcribed from the official pricing page captured in
// docs/pricing-snapshots/ on 2026-08-21. Models absent from this list are
// unknown-priced on purpose: the calculator fails closed with costUsd=null.
// gemini-3.1-flash-lite-preview has no exact entry on the official page at
// retrieval time, so it is intentionally missing here.
export const MODEL_PRICING: ModelPricing[] = [
  {
    provider: "openai",
    model: "gpt-5.5",
    currency: "USD",
    inputPer1m: 5,
    outputPer1m: 30,
    cachedInputPer1m: 0.5,
    longContextThresholdTokens: 272_000,
    longContextInputPer1m: 10,
    longContextCachedInputPer1m: 1,
    longContextOutputPer1m: 45,
  },
  {
    provider: "openai",
    model: "gpt-5.4",
    currency: "USD",
    inputPer1m: 2.5,
    outputPer1m: 15,
    cachedInputPer1m: 0.25,
    longContextThresholdTokens: 272_000,
    longContextInputPer1m: 5,
    longContextCachedInputPer1m: 0.5,
    longContextOutputPer1m: 22.5,
  },
  { provider: "openai", model: "gpt-5.4-mini", currency: "USD", inputPer1m: 0.75, outputPer1m: 4.5, cachedInputPer1m: 0.075 },
  { provider: "openai", model: "gpt-4o", currency: "USD", inputPer1m: 2.5, outputPer1m: 10, cachedInputPer1m: 1.25 },
  { provider: "openai", model: "gpt-4o-mini", currency: "USD", inputPer1m: 0.15, outputPer1m: 0.6, cachedInputPer1m: 0.075 },
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    currency: "USD",
    inputPer1m: 5,
    outputPer1m: 25,
    cachedInputPer1m: 0.5,
    cacheWritePer1m: 6.25,
    cacheWrite1hPer1m: 10,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    currency: "USD",
    inputPer1m: 3,
    outputPer1m: 15,
    cachedInputPer1m: 0.3,
    cacheWritePer1m: 3.75,
    cacheWrite1hPer1m: 6,
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    currency: "USD",
    inputPer1m: 1,
    outputPer1m: 5,
    cachedInputPer1m: 0.1,
    cacheWritePer1m: 1.25,
    cacheWrite1hPer1m: 2,
  },
  {
    provider: "google",
    model: "gemini-3.1-pro-preview",
    currency: "USD",
    inputPer1m: 2,
    outputPer1m: 12,
    cachedInputPer1m: 0.2,
    longContextThresholdTokens: 200_000,
    longContextInputPer1m: 4,
    longContextCachedInputPer1m: 0.4,
    longContextOutputPer1m: 18,
  },
  { provider: "google", model: "gemini-3-flash-preview", currency: "USD", inputPer1m: 0.5, outputPer1m: 3, cachedInputPer1m: 0.05 },
  { provider: "google", model: "gemini-3.5-flash", currency: "USD", inputPer1m: 1.5, outputPer1m: 9, cachedInputPer1m: 0.15 },
];

export function findModelPricing(provider: string, model: string): ModelPricing | null {
  return MODEL_PRICING.find((entry) => entry.provider === provider && entry.model === model) ?? null;
}
