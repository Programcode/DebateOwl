/**
 * The server and client share this catalog. Keep provider routing out of
 * feature handlers so an accepted model can only use the OpenRouter route.
 */

export type ReasoningEffort = "low" | "medium" | "high";

export interface ModelCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly maxTokens: number;
  readonly isProOnly: boolean;
  readonly supportedEfforts: readonly ReasoningEffort[];
}

export const MODEL_CATALOG = [
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", maxTokens: 128_000, isProOnly: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "openai/gpt-6-luna", name: "GPT-6 Luna", maxTokens: 128_000, isProOnly: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "meta/muse-spark-1.3-contributor", name: "Muse Spark 1.3", maxTokens: 943_718, isProOnly: false, supportedEfforts: ["low", "medium", "high"] },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", maxTokens: 128_000, isProOnly: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", maxTokens: 128_000, isProOnly: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", maxTokens: 128_000, isProOnly: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", maxTokens: 65_536, isProOnly: true, supportedEfforts: ["low", "medium", "high"] },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", maxTokens: 943_718, isProOnly: true, supportedEfforts: ["low", "high"] },
  { id: "deepseek/deepseek-v4-pro-0813", name: "DeepSeek V4 Pro", maxTokens: 384_000, isProOnly: true, supportedEfforts: ["low", "high"] },
  { id: "z-ai/glm-5.3-flash", name: "GLM-5.3 Flash", maxTokens: 131_072, isProOnly: true, supportedEfforts: ["low", "high"] },
] as const satisfies readonly ModelCatalogEntry[];

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];
export const AUTO_FAST = "auto-fast" as const;
export const AUTO_PRO = "auto-pro" as const;
export const AUTO_MODEL_SELECTIONS = [
  { id: AUTO_FAST, name: "Auto Fast", isProOnly: false },
  { id: AUTO_PRO, name: "Auto Pro", isProOnly: true },
] as const;
export type AutoModelSelection = (typeof AUTO_MODEL_SELECTIONS)[number]["id"];
export type ModelSelection = ModelId | AutoModelSelection;

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5" as const;
export const DEFAULT_PRO_MODEL = "anthropic/claude-opus-5.5" as const;

// Small background steps inside research (the Ask search decision and the
// follow-up search queries) run on this fixed cheap model at low effort,
// whatever model the user picked. Only the answer itself uses their model.
export const BACKGROUND_MODEL: ModelId = "anthropic/claude-haiku-5.5";
export const BACKGROUND_REASONING_EFFORT: ReasoningEffort = "low";

// Retired catalog IDs that older clients (an installed PWA, a saved setting)
// may still send. Both the server and the settings store resolve them here.
// The old defaults (GPT-5.6 Luna, Claude Sonnet 5) move to the new defaults;
// the rest move to their family's successor. A Basic ID never maps to Pro,
// so DeepSeek V4 Flash, which was Basic, moves to the Basic default.
const RETIRED_MODEL_SUCCESSORS = new Map<string, ModelId>([
  ["openai/gpt-5.6-luna", DEFAULT_MODEL],
  ["deepseek/deepseek-v4-flash-0731", DEFAULT_MODEL],
  ["anthropic/claude-sonnet-5", DEFAULT_PRO_MODEL],
  ["anthropic/claude-opus-5", DEFAULT_PRO_MODEL],
  ["openai/gpt-5.6-sol", "openai/gpt-6.1-sol"],
  ["openai/gpt-5.6-terra", "openai/gpt-6.1-sol"],
  ["meta/muse-spark-1.3", "meta/muse-spark-1.3-contributor"],
]);

const MODEL_BY_ID = new Map<string, ModelCatalogEntry>(MODEL_CATALOG.map((entry) => [entry.id, entry]));

export function getModelCatalogEntry(model: string): ModelCatalogEntry | undefined {
  return MODEL_BY_ID.get(model);
}

export function isAutoModelSelection(value: unknown): value is AutoModelSelection {
  return value === AUTO_FAST || value === AUTO_PRO;
}

export function retiredModelSuccessor(model: string): ModelId | undefined {
  return RETIRED_MODEL_SUCCESSORS.get(model);
}

export function isModelSelection(value: unknown): value is ModelSelection {
  return typeof value === "string" && (isAutoModelSelection(value) || MODEL_BY_ID.has(value));
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
