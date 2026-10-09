import {
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  effectiveReasoningEffort,
  getModelCatalogEntry,
  isReasoningEffort,
  MODEL_CATALOG,
  retiredModelSuccessor,
} from "./model-catalog.ts";

Deno.test("every catalog model supports the forced trial effort and both defaults resolve to valid tiers", () => {
  for (const entry of MODEL_CATALOG) {
    if (getModelCatalogEntry(entry.id) !== entry) throw new Error(`catalog lookup lost ${entry.id}`);
    if (!entry.supportedEfforts.includes("low")) throw new Error(`low effort is not declared for ${entry.id}`);
  }
  const basic = getModelCatalogEntry(DEFAULT_MODEL);
  if (!basic || basic.isProOnly) throw new Error(`Basic default is missing or Pro-only: ${DEFAULT_MODEL}`);
  if (!getModelCatalogEntry(DEFAULT_PRO_MODEL)) throw new Error(`Pro default is not in the catalog: ${DEFAULT_PRO_MODEL}`);
});

Deno.test("model catalog marks only the approved Pro entries as Pro-only", () => {
  const basic = new Set([
    "anthropic/claude-haiku-5.5",
    "openai/gpt-6-luna",
    "google/gemini-3.8-flash",
    "deepseek/deepseek-v4.1-flash",
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
  if (effectiveReasoningEffort("openai/gpt-6-luna", "high", false) !== "low") {
    throw new Error("trial request did not force low");
  }
  if (effectiveReasoningEffort("anthropic/claude-opus-5.5", "medium", true) !== "medium") {
    throw new Error("native Pro medium was changed");
  }
  for (const model of ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-pro-0813", "z-ai/glm-5.3-flash"]) {
    if (effectiveReasoningEffort(model, "medium", true) !== "low") {
      throw new Error(`unsupported Pro medium was not lowered for ${model}`);
    }
  }
});

Deno.test("retired model IDs resolve to catalog models without crossing into Pro", () => {
  const retiredBasic = ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash-0731"];
  const retiredPro = ["anthropic/claude-sonnet-5", "anthropic/claude-opus-5", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra"];
  for (const id of [...retiredBasic, ...retiredPro]) {
    const successor = retiredModelSuccessor(id);
    const entry = successor && getModelCatalogEntry(successor);
    if (!entry) throw new Error(`retired ${id} has no catalog successor`);
    if (retiredBasic.includes(id) && entry.isProOnly) throw new Error(`retired Basic ${id} resolves to Pro ${entry.id}`);
  }
  if (retiredModelSuccessor(DEFAULT_MODEL) !== undefined) throw new Error("a current model was treated as retired");
});
