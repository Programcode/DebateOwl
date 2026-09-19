import {
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  effectiveReasoningEffort,
  getModelCatalogEntry,
  isReasoningEffort,
  MODEL_CATALOG,
} from "./model-catalog.ts";

const APPROVED_IDS = [
  "openai/gpt-5.6-luna",
  "google/gemini-3.8-flash",
  "deepseek/deepseek-v4-flash-0731",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "deepseek/deepseek-v4-pro-0813",
  "z-ai/glm-5.3-flash",
  "meta/muse-spark-1.3",
] as const;

Deno.test("model catalog contains the ten approved exact OpenRouter IDs", () => {
  const ids = MODEL_CATALOG.map((entry) => entry.id);
  if (ids.length !== APPROVED_IDS.length) throw new Error(`unexpected catalog size: ${ids.length}`);
  for (const id of APPROVED_IDS) {
    const entry = getModelCatalogEntry(id);
    if (!entry || !ids.includes(id)) throw new Error(`missing approved model: ${id}`);
    if (!entry.name || entry.maxTokens <= 0) throw new Error(`incomplete model entry: ${id}`);
    if (!entry.supportedEfforts.includes("low")) throw new Error(`low effort is not declared for ${id}`);
  }
  if (DEFAULT_MODEL !== "openai/gpt-5.6-luna") throw new Error(`unexpected Basic default: ${DEFAULT_MODEL}`);
  if (DEFAULT_PRO_MODEL !== "anthropic/claude-sonnet-5") throw new Error(`unexpected Pro default: ${DEFAULT_PRO_MODEL}`);
});

Deno.test("model catalog marks only the approved Pro entries as Pro-only", () => {
  const basic = new Set([
    "openai/gpt-5.6-luna",
    "google/gemini-3.8-flash",
    "deepseek/deepseek-v4-flash-0731",
  ]);
  for (const entry of MODEL_CATALOG) {
    if (entry.isProOnly === basic.has(entry.id)) throw new Error(`incorrect tier for ${entry.id}`);
  }
});

Deno.test("reasoning effort validator accepts only the product values", () => {
  for (const effort of ["low", "medium", "high"]) {
    if (!isReasoningEffort(effort)) throw new Error(`accepted effort rejected: ${effort}`);
  }
  for (const effort of ["none", "max", "xhigh", "", null, 1, undefined]) {
    if (isReasoningEffort(effort)) throw new Error(`unsupported effort accepted: ${String(effort)}`);
  }
});

Deno.test("trial and unsupported Pro reasoning resolve server-side", () => {
  if (effectiveReasoningEffort("openai/gpt-5.6-luna", "high", false) !== "low") {
    throw new Error("trial request did not force low");
  }
  if (effectiveReasoningEffort("anthropic/claude-sonnet-5", "medium", true) !== "medium") {
    throw new Error("native Pro medium was changed");
  }
  for (const model of ["deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-pro-0813", "z-ai/glm-5.3-flash"]) {
    if (effectiveReasoningEffort(model, "medium", true) !== "low") {
      throw new Error(`unsupported Pro medium was not lowered for ${model}`);
    }
  }
});
