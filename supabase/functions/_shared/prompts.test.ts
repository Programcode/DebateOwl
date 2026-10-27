import {
  ATTACK_PROMPT,
  ASK_PROMPT,
  CROSSFIRE_PROMPT,
  BRAINSTORM_PROMPT,
  FACTOIDS_PROMPT,
  GENERATE_PROMPT,
  JSON_RULES,
  RESEARCH_RULES,
  SPARRING_PROMPT,
  boundPromptSources,
  buildSystemPrompt,
  MAX_PROMPT_SOURCE_CHARS,
  MAX_PROMPT_SOURCE_COUNT,
  MAX_PROMPT_SOURCE_TOTAL_CHARS,
  type Feature,
  UNTRUSTED_CONTENT_RULES,
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
  attack: "You are an experienced competitive debater and coach.",
  brainstorm: "You're in the prep room with your team before a tournament round.",
  factoids: "You are a debate research specialist helping a team find cuttable evidence for tournament prep.",
  ask: "You are a debate coach chat bot. Answer the user's question.",
  sparring: "You are DebateOwl's live debate sparring opponent and impartial judge.",
  crossfire: "You are DebateOwl's crossfire coach.",
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

Deno.test("admin, library, debate, and student-material rules follow the task layer in order", () => {
  const prompt = buildSystemPrompt({
    feature: "generate",
    globalPrompt: "ADMIN RULE",
    sources: [{ title: "Library study", content: "LIBRARY TEXT", type: "text" }],
    debateContext: {
      motion: "This House would ban homework",
      side: "pro",
      settings: { format: "4-6-6-3" },
      instructions: "STUDENT INSTRUCTION",
      outputs: [],
    },
  });
  const taskIndex = prompt.indexOf(GENERATE_PROMPT.slice(0, 40));
  const adminIndex = prompt.indexOf("ADMIN-CONFIGURED INSTRUCTIONS:\nADMIN RULE");
  const libraryIndex = prompt.indexOf("LIBRARY TEXT");
  const debateIndex = prompt.indexOf("STUDENT INSTRUCTION");
  const rulesIndex = prompt.indexOf(UNTRUSTED_CONTENT_RULES);
  if ([taskIndex, adminIndex, libraryIndex, debateIndex, rulesIndex].includes(-1)) throw new Error("section missing");
  if (!(taskIndex < adminIndex && adminIndex < libraryIndex && libraryIndex < debateIndex && debateIndex < rulesIndex)) {
    throw new Error("section order wrong");
  }
  if (!prompt.endsWith(UNTRUSTED_CONTENT_RULES)) throw new Error("student-material rules must close the prompt");
});

Deno.test("date context replaces the placeholder in every feature task prompt", () => {
  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature, dateContext: "CURRENT DATE: Testdate" });
    if (prompt.includes("[DATE_CONTEXT]")) throw new Error(`${feature}: date placeholder not replaced`);
    if (!prompt.includes("CURRENT DATE: Testdate")) throw new Error(`${feature}: date context missing`);
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
