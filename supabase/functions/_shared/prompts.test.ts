import {
  ATTACK_PROMPT,
  ASK_PROMPT,
  BRAINSTORM_PROMPT,
  FACTOIDS_PROMPT,
  GENERATE_PROMPT,
  JSON_RULES,
  PRODUCT_IDENTITY,
  RESEARCH_RULES,
  SPARRING_PROMPT,
  buildSystemPrompt,
  type Feature,
} from "./prompts.ts";

const FEATURES: Feature[] = ["generate", "attack", "brainstorm", "factoids", "ask", "sparring"];

const FEATURE_PROMPTS: Record<Feature, string> = {
  generate: GENERATE_PROMPT,
  attack: ATTACK_PROMPT,
  brainstorm: BRAINSTORM_PROMPT,
  factoids: FACTOIDS_PROMPT,
  ask: ASK_PROMPT,
  sparring: SPARRING_PROMPT,
};

Deno.test("every feature system prompt carries the product identity layer", () => {
  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature, dateContext: "CURRENT DATE: August 21, 2026" });
    if (!prompt.includes("DEBATELAB PRODUCT IDENTITY")) {
      throw new Error(`${feature}: product identity layer missing`);
    }
    if (!prompt.includes(FEATURE_PROMPTS[feature].slice(0, 40))) {
      throw new Error(`${feature}: feature task layer missing`);
    }
  }
});

Deno.test("every feature system prompt carries the JSON-only output rules exactly once", () => {
  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature });
    const first = prompt.indexOf(JSON_RULES);
    if (first === -1) throw new Error(`${feature}: JSON rules missing`);
    if (prompt.indexOf(JSON_RULES, first + 1) !== -1) throw new Error(`${feature}: JSON rules duplicated`);
  }
});

Deno.test("research and citation honesty rules are present when research is provided", () => {
  const prompt = buildSystemPrompt({ feature: "ask", researchContext: "=== WEB RESEARCH RESULTS ===" });
  if (!prompt.includes(RESEARCH_RULES.slice(0, 60))) throw new Error("research rules missing");
  if (!prompt.includes("=== WEB RESEARCH RESULTS ===")) throw new Error("research context missing");
});

Deno.test("research rules are absent when no research was provided", () => {
  const prompt = buildSystemPrompt({ feature: "brainstorm" });
  if (prompt.includes("RESEARCH CITATION RULES:") || prompt.includes(RESEARCH_RULES.slice(0, 60))) {
    throw new Error("citation rules leaked into a prompt without research");
  }
});

Deno.test("admin and custom prompt sections are appended after the task layer", () => {
  const prompt = buildSystemPrompt({
    feature: "generate",
    globalPrompt: "ADMIN RULE",
    customPrompt: "CUSTOM RULE",
  });
  const taskIndex = prompt.indexOf(GENERATE_PROMPT.slice(0, 40));
  const adminIndex = prompt.indexOf("ADMIN-CONFIGURED INSTRUCTIONS:\nADMIN RULE");
  const customIndex = prompt.indexOf("CUSTOM SYSTEM PROMPT:\nCUSTOM RULE");
  if (taskIndex === -1 || adminIndex === -1 || customIndex === -1) throw new Error("section missing");
  if (!(taskIndex < adminIndex && adminIndex < customIndex)) throw new Error("section order wrong");
});

Deno.test("date context replaces the placeholder in every feature task prompt", () => {
  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature, dateContext: "CURRENT DATE: Testdate" });
    if (prompt.includes("[DATE_CONTEXT]")) throw new Error(`${feature}: date placeholder not replaced`);
    if (!prompt.includes("CURRENT DATE: Testdate")) throw new Error(`${feature}: date context missing`);
  }
});

Deno.test("product identity includes the humanizer style rules", () => {
  if (!PRODUCT_IDENTITY.includes("HUMANIZER STYLE INSTRUCTIONS")) throw new Error("humanizer missing from identity layer");
});

Deno.test("sparring system prompt defines difficulty and transcript-only scoring", () => {
  const prompt = buildSystemPrompt({ feature: "sparring", dateContext: "CURRENT DATE: Testdate" });
  if (!prompt.includes("Difficulty is a real control")) throw new Error("difficulty guidance missing");
  if (!prompt.includes("clarity, organization, and time discipline")) throw new Error("typed delivery guidance missing");
  if (!prompt.includes("Never invent citations")) throw new Error("transcript-only guidance missing");
});

Deno.test("sparring system prompt teaches the school 4-6-6-3 speaker duties", () => {
  const prompt = buildSystemPrompt({ feature: "sparring", dateContext: "CURRENT DATE: August 31, 2026 (2026)" });
  for (const expected of ["Introductor", "R1", "R2", "Conclusor", "no new arguments"]) {
    if (!prompt.includes(expected)) throw new Error(`school role guidance missing: ${expected}`);
  }
});

Deno.test("sparring system prompt keeps LD and PF duties separate from school roles", () => {
  const prompt = buildSystemPrompt({ feature: "sparring", dateContext: "CURRENT DATE: August 31, 2026 (2026)" });
  if (!prompt.includes('When format is "standard"')) throw new Error("school role condition missing");
  if (!prompt.includes('When format is "ld" or "pf"')) throw new Error("LD/PF role condition missing");
  if (!prompt.includes("rather than importing the school roles")) throw new Error("format separation missing");
});
