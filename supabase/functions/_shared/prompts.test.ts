import {
  ATTACK_PROMPT,
  ASK_PROMPT,
  CROSSFIRE_PROMPT,
  BRAINSTORM_PROMPT,
  FACTOIDS_PROMPT,
  GENERATE_PROMPT,
  JSON_RULES,
  PRODUCT_IDENTITY,
  RESEARCH_RULES,
  SPARRING_PROMPT,
  boundPromptSources,
  buildSystemPrompt,
  MAX_PROMPT_SOURCE_CHARS,
  MAX_PROMPT_SOURCE_COUNT,
  MAX_PROMPT_SOURCE_TOTAL_CHARS,
  type Feature,
} from "./prompts.ts";

const FEATURES: Feature[] = ["generate", "attack", "brainstorm", "factoids", "ask", "sparring", "crossfire"];

const FEATURE_PROMPTS: Record<Feature, string> = {
  generate: GENERATE_PROMPT,
  attack: ATTACK_PROMPT,
  brainstorm: BRAINSTORM_PROMPT,
  factoids: FACTOIDS_PROMPT,
  ask: ASK_PROMPT,
  sparring: SPARRING_PROMPT,
  crossfire: CROSSFIRE_PROMPT,
};

const FEATURE_MARKERS: Record<Feature, string> = {
  generate: "You are an experienced competitive debater and coach with years of tournament experience.",
  attack: "You are a ruthless, experienced competitive debater tasked with tearing apart an opponent's case.",
  brainstorm: "You're in the prep room with your team before a tournament round.",
  factoids: "You are a debate research specialist helping a team find cuttable evidence for tournament prep.",
  ask: "You are a debate coach chat bot. Answer the user's question.",
  sparring: "You are DebateLab's live debate sparring opponent and impartial judge.",
  crossfire: "You are DebateLab's crossfire coach.",
};

function occurrences(text: string, value: string): number {
  return value ? text.split(value).length - 1 : 0;
}

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

Deno.test("every feature system prompt carries exactly one feature task layer", () => {
  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature });
    if (occurrences(prompt, FEATURE_MARKERS[feature]) !== 1) {
      throw new Error(`${feature}: feature task layer was duplicated or omitted`);
    }
  }
});

Deno.test("research citation rules appear exactly when research is attached", () => {
  for (const feature of FEATURES) {
    const withoutResearch = buildSystemPrompt({ feature });
    if (withoutResearch.includes("RESEARCH CITATION RULES:")) {
      throw new Error(`${feature}: research rules leaked without research`);
    }

    const withResearch = buildSystemPrompt({ feature, researchContext: "WEB RESEARCH RESULTS" });
    if (occurrences(withResearch, RESEARCH_RULES) !== 1 || !withResearch.includes("WEB RESEARCH RESULTS")) {
      throw new Error(`${feature}: research rules were not attached exactly once`);
    }
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

Deno.test("sparring system prompt names the behavioral rules for school, LD, and PF", () => {
  const prompt = buildSystemPrompt({ feature: "sparring" });
  for (const expected of [
    'When format is "standard"',
    'When format is "ld" or "pf"',
    "Difficulty is a real control",
    "Follow the requested language for every prose field",
  ]) {
    if (!prompt.includes(expected)) throw new Error(`sparring control guidance missing: ${expected}`);
  }
  if (prompt.includes("RESEARCH CITATION RULES:")) throw new Error("sparring received research rules without research");
});

Deno.test("crossfire system prompt carries strict turn and debrief safety rules", () => {
  const prompt = buildSystemPrompt({ feature: "crossfire" });
  if (!prompt.includes("Each non-empty debrief item must cite only actual turn IDs")) {
    throw new Error("crossfire turn-reference rule missing");
  }
  if (!prompt.includes("without insults, threats, harassment")) {
    throw new Error("crossfire style safety rule missing");
  }
  if (prompt.includes("RESEARCH CITATION RULES:")) {
    throw new Error("crossfire unexpectedly carries live research rules");
  }
});

Deno.test("prompt source library is capped by count, per-source text, and aggregate text", () => {
  const sources = Array.from({ length: MAX_PROMPT_SOURCE_COUNT + 2 }, (_, index) => ({
    title: `Source ${index}`,
    content: "x".repeat(1_000),
    type: "text",
  }));
  const bounded = boundPromptSources(sources);
  if (bounded.length !== MAX_PROMPT_SOURCE_COUNT) throw new Error("source count cap was not applied");
  const longSource = boundPromptSources([{ title: "Long", content: "x".repeat(MAX_PROMPT_SOURCE_CHARS + 1), type: "text" }]);
  if (longSource.some((source) => source.content.length > MAX_PROMPT_SOURCE_CHARS)) {
    throw new Error("per-source text cap was not applied");
  }
  const aggregate = bounded.reduce((sum, source) => sum + source.content.length, 0);
  if (aggregate > MAX_PROMPT_SOURCE_TOTAL_CHARS) throw new Error("aggregate source cap was not applied");
  const oversized = boundPromptSources(
    Array.from({ length: MAX_PROMPT_SOURCE_COUNT }, (_, index) => ({
      title: `Big ${index}`,
      content: "x".repeat(MAX_PROMPT_SOURCE_CHARS),
      type: "text",
    })),
  );
  const oversizedTotal = oversized.reduce((sum, source) => sum + source.content.length, 0);
  if (oversizedTotal !== MAX_PROMPT_SOURCE_TOTAL_CHARS) {
    throw new Error(`aggregate cap was not enforced: ${oversizedTotal}`);
  }

  const malformed = boundPromptSources([null, {}, { title: "Valid", content: "Evidence", type: "x".repeat(100), origin: "o".repeat(600) }]);
  if (malformed.length !== 1 || malformed[0].type.length !== 64 || (malformed[0].origin?.length ?? 0) !== 500) {
    throw new Error("malformed sources were not rejected or metadata was not bounded");
  }
});
