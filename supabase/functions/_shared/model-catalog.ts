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
  { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", maxTokens: 131_072, isProOnly: false, supportsTemperature: true, supportedEfforts: ["low", "high"] },
] as const satisfies readonly ModelCatalogEntry[];

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash" as const;
export const DEFAULT_PRO_MODEL = DEFAULT_MODEL;

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
