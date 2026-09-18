import {
  DEFAULT_MODEL,
  getModelCatalogEntry,
  MODEL_CATALOG,
} from "./model-catalog.ts";

const GLM_FLASH = "z-ai/glm-5.3-flash";

Deno.test("GLM 5.3 Flash is the only default OpenRouter model", () => {
  if (DEFAULT_MODEL !== GLM_FLASH) {
    throw new Error(`unexpected default model: ${DEFAULT_MODEL}`);
  }
  if (MODEL_CATALOG.length !== 1 || MODEL_CATALOG[0]?.id !== GLM_FLASH) {
    throw new Error(`unexpected model catalog: ${MODEL_CATALOG.map((entry) => entry.id).join(", ")}`);
  }
  const entry = getModelCatalogEntry(GLM_FLASH);
  if (!entry || entry.isProOnly) {
    throw new Error("GLM 5.3 Flash must be available to trial and Pro users");
  }
});
