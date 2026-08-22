// Regression matrix: every visible AI control must provably change the
// request payload (prompt layer), retrieval/query construction, or output
// shape through deterministic post-processing. If a row here starts failing,
// a control has gone decorative.

import { buildAskBasePrompt, buildUserPrompt } from "./prompt-builder.ts";
import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
} from "../_shared/control-enforcement.ts";
import { buildSearchQueries } from "../_shared/source-quality.ts";

function assertIncludes(text: string, expected: string, label: string) {
  if (!text.includes(expected)) throw new Error(`[${label}] prompt missing "${expected}"`);
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`[${label}] behavioral effect missing`);
}

Deno.test("generate controls propagate to prompt and post-processing", () => {
  const genBrief = buildUserPrompt("generate", { motion: "M", side: "pro", length: "brief", role: "r1" }, "");
  assertIncludes(genBrief, "Length: brief", "generate.length payload");
  assertIncludes(genBrief, "Length Instruction: Return exactly 2 contentions", "generate.length prompt");
  const out: Record<string, unknown> = { contentions: [{}, {}, {}], metadata: {} };
  enforceGenerateControls(out, "pro", "custom", "brief", "intro");
  assert((out.contentions as unknown[]).length === 2, "generate.length post-processing");

  assertIncludes(
    buildUserPrompt("generate", { motion: "M", side: "pro", audience: "advanced", role: "r1" }, ""),
    "Audience Instruction: Assume an advanced debater",
    "generate.audience",
  );
  assertIncludes(
    buildUserPrompt("generate", { motion: "M", side: "pro", tone: "aggressive", role: "r1" }, ""),
    "Tone Instruction: Use sharper strategic phrasing",
    "generate.tone",
  );
  assertIncludes(buildUserPrompt("generate", { motion: "M", side: "con", role: "r1" }, ""), "Side: con", "generate.side");
  assertIncludes(buildUserPrompt("generate", { motion: "M", side: "pro", role: "conc" }, ""), "Role: conc", "generate.role");
});

Deno.test("attack controls propagate to prompt and post-processing", () => {
  const attackOff = buildUserPrompt("attack", { caseText: "C", detectFallacies: false, analyzeWeighing: false }, "");
  assertIncludes(attackOff, "Detect Fallacies: disabled", "attack.fallacies payload");
  assertIncludes(attackOff, "Analyze Weighing: disabled", "attack.weighing payload");
  const out: Record<string, unknown> = {
    fallaciesDetected: [{}],
    weighingAnalysis: { currentWeighing: "x", missingComparisons: ["y"], improvementSuggestions: ["z"] },
  };
  enforceAttackControls(out, false, false);
  assert((out.fallaciesDetected as unknown[]).length === 0, "attack.fallacies post-processing");

  assertIncludes(
    buildUserPrompt("attack", { caseText: "C", aggressiveness: "ruthless", judgeParadigm: "policy" }, ""),
    "Attack Intensity: ruthless",
    "attack.intensity",
  );
  assertIncludes(
    buildUserPrompt("attack", { caseText: "C", judgeParadigm: "values" }, ""),
    "Judge Paradigm: values",
    "attack.paradigm",
  );
});

Deno.test("brainstorm controls propagate to prompt and post-processing", () => {
  assertIncludes(
    buildUserPrompt("brainstorm", { motion: "M", side: "pro", outputMode: "buckets" }, ""),
    "Output Mode: buckets",
    "brainstorm.outputMode payload",
  );
  const out: Record<string, unknown> = { topFive: [], mindmap: [], buckets: [] };
  enforceBrainstormControls(out, "pro", "buckets");
  assert("buckets" in out && !("topFive" in out), "brainstorm.outputMode post-processing");
  assertIncludes(buildUserPrompt("brainstorm", { motion: "M", side: "both", outputMode: "topfive" }, ""), "Side: both", "brainstorm.side");
});

Deno.test("factoids controls propagate to prompt and query construction", () => {
  assertIncludes(
    buildUserPrompt("factoids", { claim: "C", region: "EU", sourceType: "government", timeframe: "2024-2026" }, ""),
    "Source Type: government",
    "factoids.sourceType prompt",
  );
  assertIncludes(
    buildUserPrompt("factoids", { claim: "C", region: "EU", timeframe: "2024-2026" }, ""),
    "Timeframe: 2024-2026",
    "factoids.timeframe prompt",
  );
  const govQueries = buildSearchQueries("C", "EU", "government", "2024-2026");
  assert(govQueries.some((q) => q.includes("site:gov")), "factoids.sourceType retrieval");
});

Deno.test("ask toggles and modes appear verbatim in the request prompt", () => {
  assertIncludes(buildUserPrompt("ask", { message: "Hi", mode: "clarify" }, ""), "Mode Guidance:", "ask.mode payload");

  const allOn = buildAskBasePrompt({
    message: "Hi",
    mode: "clarify",
    citationMode: true,
    webSearchEnabled: true,
    prosConsMode: true,
    argumentMapMode: true,
    researchAvailable: true,
  });
  assertIncludes(allOn, "Citation Mode: ON", "ask.citationMode payload");
  assertIncludes(allOn, "Web Search: ENABLED", "ask.webSearch payload");
  assertIncludes(allOn, "Pros/Cons: ON", "ask.prosCons payload");
  assertIncludes(allOn, "Argument Map: ON", "ask.argumentMap payload");
  assertIncludes(allOn, "Research Context: AVAILABLE", "ask.research gating");

  const allOff = buildAskBasePrompt({
    message: "Hi",
    mode: "general",
    citationMode: false,
    webSearchEnabled: false,
    prosConsMode: false,
    argumentMapMode: false,
    researchAvailable: false,
  });
  assertIncludes(allOff, "Citation Mode: OFF", "ask.citationMode off state");
  assertIncludes(allOff, "Web Search: DISABLED", "ask.webSearch off state");
  assertIncludes(allOff, "Pros/Cons: OFF", "ask.prosCons off state");
  assertIncludes(allOff, "Argument Map: OFF", "ask.argumentMap off state");
  assertIncludes(allOff, "Research Context: NONE", "ask.research off state");

  const out: Record<string, unknown> = { response: "r", followUpQuestions: [], uncertainties: [] };
  enforceAskControls(out, { mode: "clarify" });
  assert((out.uncertainties as string[]).length > 0, "ask.clarify post-processing");
});
