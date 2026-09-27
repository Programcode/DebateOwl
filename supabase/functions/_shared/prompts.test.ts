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

Deno.test("the retired per-user custom prompt has no prompt layer", () => {
  const prompt = buildSystemPrompt({ feature: "ask", globalPrompt: "ADMIN RULE" });
  if (prompt.includes("CUSTOM SYSTEM PROMPT")) throw new Error("custom prompt layer still rendered");
  if (prompt.includes("STUDENT MATERIAL RULES")) throw new Error("material rules added without student material");
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

Deno.test("feature prompts carry plain-language calibration", () => {
  const expectedByFeature: Record<Feature, string> = {
    generate: "Match the requested audience, length, and tone.",
    attack: "Be direct and substantive, not hostile.",
    brainstorm: "Use plain language and concrete examples.",
    factoids: "Write evidence in clear, card-ready language.",
    ask: "Answer the user's question first in plain language.",
    sparring: "Difficulty changes argument pressure, not vocabulary.",
    crossfire: "Ask one direct question at a time.",
  };

  for (const feature of FEATURES) {
    const prompt = buildSystemPrompt({ feature });
    if (!prompt.includes(expectedByFeature[feature])) {
      throw new Error(`${feature}: plain-language calibration missing`);
    }
  }
});

Deno.test("Crossfire keeps replies short and easy to say aloud", () => {
  const prompt = buildSystemPrompt({ feature: "crossfire" });
  if (!prompt.includes("Keep the answer short and easy to say aloud.")) {
    throw new Error("Crossfire speech-length guidance missing");
  }
  if (!prompt.includes("Questions should be one sentence. Answers should be no more than three short sentences.")) {
    throw new Error("Crossfire sentence-length guidance missing");
  }
  if (!prompt.includes("Use the user's own words where possible")) {
    throw new Error("Crossfire vocabulary guidance missing");
  }
  if (!prompt.includes("Tie each reply to the latest relevant transcript turn")) {
    throw new Error("Crossfire transcript-targeting guidance missing");
  }
});

Deno.test("shared language rules honor explicit output-language instructions", () => {
  const prompt = buildSystemPrompt({ feature: "generate" });
  if (!prompt.includes("Follow any explicit output-language instruction. Otherwise match the language used by the user.")) {
    throw new Error("explicit output-language rule missing");
  }
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
