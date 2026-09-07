/**
 * The server and client share this catalog. Keep provider routing out of
 * feature handlers so an accepted model can only use the OpenRouter route.
 */

export type ReasoningEffort = "low" | "medium" | "high";
export const MAX_REQUEST_OUTPUT_TOKENS = 32_768;

export interface ModelCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly maxTokens: number;
  readonly isProOnly: boolean;
  readonly supportsTemperature: boolean;
  readonly supportedEfforts: readonly ReasoningEffort[];
}

export const MODEL_CATALOG = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", maxTokens: 128_000, isProOnly: false, supportsTemperature: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", maxTokens: 65_536, isProOnly: false, supportsTemperature: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash", maxTokens: 131_072, isProOnly: false, supportsTemperature: true, supportedEfforts: ["low", "high"] },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", maxTokens: 128_000, isProOnly: true, supportsTemperature: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5", maxTokens: 128_000, isProOnly: true, supportsTemperature: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", maxTokens: 128_000, isProOnly: true, supportsTemperature: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra", maxTokens: 128_000, isProOnly: true, supportsTemperature: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "deepseek/deepseek-v4-pro-0813", name: "DeepSeek V4 Pro", maxTokens: 384_000, isProOnly: true, supportsTemperature: true, supportedEfforts: ["low", "high"] },
  { id: "z-ai/glm-5.3-flash", name: "GLM-5.3 Flash", maxTokens: 131_072, isProOnly: true, supportsTemperature: true, supportedEfforts: ["low", "high"] },
  { id: "meta/muse-spark-1.3", name: "Muse Spark 1.3", maxTokens: 943_718, isProOnly: true, supportsTemperature: true, supportedEfforts: ["low", "medium", "high"] },
] as const satisfies readonly ModelCatalogEntry[];

export const DEFAULT_MODEL = "openai/gpt-5.6-luna" as const;
export const DEFAULT_PRO_MODEL = "anthropic/claude-sonnet-5" as const;

const MODEL_BY_ID = new Map<string, ModelCatalogEntry>(MODEL_CATALOG.map((entry) => [entry.id, entry]));

export function getModelCatalogEntry(model: string): ModelCatalogEntry | undefined {
  return MODEL_BY_ID.get(model);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === "low" || value === "medium" || value === "high";
}

export function effectiveReasoningEffort(
  model: string,
  requested: ReasoningEffort | undefined,
  canAccessProModels: boolean,
): ReasoningEffort {
  if (!canAccessProModels) return "low";
  const effort = requested ?? "medium";
  const entry = getModelCatalogEntry(model);
  return effort === "medium" && entry && !entry.supportedEfforts.includes("medium") ? "low" : effort;
}
