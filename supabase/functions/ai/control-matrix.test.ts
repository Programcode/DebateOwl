// Regression matrix: every visible AI control must provably change the
// request payload (prompt layer), retrieval/query construction, or output
// shape through deterministic post-processing. If a row here starts failing,
// a control has gone decorative.

import { buildAskBasePrompt, buildUserPrompt } from "./prompt-builder.ts";
import { buildSystemPrompt } from "../_shared/prompts.ts";
import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
  isAskStreamingModeAllowed,
} from "../_shared/control-enforcement.ts";
import { buildSearchRequests } from "../_shared/source-quality.ts";

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

  const underlength: Record<string, unknown> = { contentions: [{}], metadata: {} };
  let rejected = false;
  try {
    enforceGenerateControls(underlength, "pro", "custom", "comprehensive", "r1");
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("requires exactly 4");
  }
  assert(rejected, "generate.length underlength responses fail closed");
  assert((underlength.contentions as unknown[]).length === 1, "generate.length never fabricates contentions");

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

Deno.test("generate length and role controls preserve the output contract", () => {
  const targets = { brief: 2, standard: 3, comprehensive: 4 } as const;
  for (const length of ["brief", "standard", "comprehensive"] as const) {
    for (const role of ["intro", "r1", "r2", "conc"] as const) {
      const output: Record<string, unknown> = {
        exordio: { hook: "hook", transition: "transition" },
        contentions: [{}, {}, {}, {}],
        metadata: {},
      };
      enforceGenerateControls(output, "pro", "custom", length, role);
      assert((output.contentions as unknown[]).length === targets[length], `generate.${length} output count`);
      assert((role === "intro") === ("exordio" in output), `generate.${role} exordio shape`);
    }
  }
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

Deno.test("attack toggle controls retain or clear only their requested sections", () => {
  for (const detectFallacies of [true, false]) {
    for (const analyzeWeighing of [true, false]) {
      const output: Record<string, unknown> = {
        fallaciesDetected: [{}],
        weighingAnalysis: {
          currentWeighing: "x",
          missingComparisons: ["y"],
          improvementSuggestions: ["z"],
        },
      };
      enforceAttackControls(output, detectFallacies, analyzeWeighing);
      assert(
        detectFallacies === ((output.fallaciesDetected as unknown[]).length > 0),
        `attack.fallacies ${detectFallacies ? "enabled" : "disabled"}`,
      );
      if (!analyzeWeighing) {
        const weighing = output.weighingAnalysis as { currentWeighing?: string };
        assert(weighing.currentWeighing === "Weighing analysis was not requested.", "attack.weighing disabled");
      } else {
        assert((output.weighingAnalysis as { currentWeighing?: string }).currentWeighing === "x", "attack.weighing enabled");
      }
    }
  }
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

Deno.test("brainstorm output mode controls keep only the requested branch", () => {
  for (const side of ["pro", "con", "both"] as const) {
    for (const outputMode of ["topfive", "mindmap", "buckets"] as const) {
      const output: Record<string, unknown> = { topFive: [], mindmap: [], buckets: [] };
      enforceBrainstormControls(output, side, outputMode);
      const expectedKey = outputMode === "topfive" ? "topFive" : outputMode;
      assert(expectedKey in output, `brainstorm.${side}.${outputMode} selected output`);
      for (const key of ["topFive", "mindmap", "buckets"] as const) {
        if (key !== expectedKey) assert(!(key in output), `brainstorm.${side}.${outputMode} removed ${key}`);
      }
    }
  }
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
  const govRequests = buildSearchRequests("C", "EU", "government", "2024-2026");
  assert(govRequests.some((request) => request.includeDomains?.includes("energy.gov")), "factoids.sourceType retrieval");
  assert(govRequests.some((request) => request.startPublishedDate?.startsWith("2024")), "factoids.timeframe retrieval");
  assert(govRequests.some((request) => request.endPublishedDate?.startsWith("2026")), "factoids.timeframe upper bound");
});

Deno.test("factoids matrix preserves legal, statistics, academic, recent, direction, and count effects", () => {
  const legalRequests = buildSearchRequests("Is this law constitutional?", "EU", "government", "2024-2026");
  assert(legalRequests.some((request) => request.query.includes("official law court ruling")), "factoids.legal query");
  assert(legalRequests.some((request) => request.includeDomains?.includes("curia.europa.eu")), "factoids.legal domains");

  const statisticsRequests = buildSearchRequests("What do the latest statistics show?", "Global", "government", "2025-2026");
  assert(statisticsRequests.some((request) => request.query.includes("government statistics report")), "factoids.statistics query");
  assert(statisticsRequests.some((request) => request.includeDomains?.includes("census.gov")), "factoids.statistics domains");

  const academicRequests = buildSearchRequests("Does the literature support this?", "United States", "academic", "Recent (last 5 years)");
  assert(academicRequests.some((request) => request.category === "publication"), "factoids.academic source filter");

  const recentRequests = buildSearchRequests("Recent evidence", "Global", "any", "2025-2026");
  assert(recentRequests.some((request) => request.startPublishedDate?.startsWith("2025")), "factoids.recent lower bound");
  assert(recentRequests.some((request) => request.endPublishedDate?.startsWith("2026")), "factoids.recent upper bound");

  const againstPrompt = buildUserPrompt("factoids", {
    claim: "MATRIX CLAIM",
    direction: "against",
    sourceType: "academic",
    timeframe: "2025-2026",
    sourceCount: 12,
  }, "");
  assertIncludes(againstPrompt, "Find evidence against this statement", "factoids.direction");
  assertIncludes(againstPrompt, "Source Type: academic", "factoids.academic prompt");
  assertIncludes(againstPrompt, "Source Count: 12", "factoids.sourceCount prompt");
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

  const out: Record<string, unknown> = {
    response: "r",
    followUpQuestions: ["q"],
    uncertainties: [] as string[],
    prosConsAnalysis: { pros: ["p"], cons: ["c"] },
    argumentMap: { mainClaim: "m", supportingPoints: [], counterpoints: [], assumptions: [] },
  };
  enforceAskControls(out, { mode: "clarify", citationMode: true, prosConsMode: true, argumentMapMode: true });
  assert((out.uncertainties as string[]).length === 0, "ask.clarify quiet when follow-ups exist");
  assert("prosConsAnalysis" in out && "argumentMap" in out, "ask toggles on keep sections");

  const stripped: Record<string, unknown> = { response: "r", followUpQuestions: [], uncertainties: [], citations: [{}] };
  enforceAskControls(stripped, { mode: "general" });
  assert(Array.isArray(stripped.citations) && stripped.citations.length === 0, "ask citations off clears list");
});

Deno.test("ask matrix preserves every mode, toggle, research, and output effect", () => {
  const commonLanguageRule = "Follow any explicit output-language instruction. Otherwise match the language used by the user.";

  for (const mode of ["general", "clarify"] as const) {
    for (const citationMode of [false, true]) {
      for (const webSearchEnabled of [false, true]) {
        for (const prosConsMode of [false, true]) {
          for (const argumentMapMode of [false, true]) {
            for (const researchAvailable of [false, true]) {
              const prompt = buildAskBasePrompt({
                message: "MATRIX QUESTION",
                mode,
                citationMode,
                webSearchEnabled,
                prosConsMode,
                argumentMapMode,
                researchAvailable,
              });
              assertIncludes(prompt, "Message: MATRIX QUESTION", "ask.message");
              assertIncludes(prompt, `Mode: ${mode}`, `ask.${mode}.mode`);
              assertIncludes(prompt, "Mode Guidance:", `ask.${mode}.guidance`);
              assertIncludes(prompt, `Citation Mode: ${citationMode ? "ON" : "OFF"}`, "ask.citationMode");
              assertIncludes(prompt, `Web Search: ${webSearchEnabled ? "ENABLED" : "DISABLED"}`, "ask.webSearch");
              assertIncludes(prompt, `Pros/Cons: ${prosConsMode ? "ON" : "OFF"}`, "ask.prosCons");
              assertIncludes(prompt, `Argument Map: ${argumentMapMode ? "ON" : "OFF"}`, "ask.argumentMap");
              assertIncludes(prompt, `Research Context: ${researchAvailable ? "AVAILABLE" : "NONE"}`, "ask.research");

              const systemPrompt = buildSystemPrompt({
                feature: "ask",
                ...(researchAvailable ? { researchContext: "MATRIX RESEARCH" } : {}),
              });
              assert(systemPrompt.includes(commonLanguageRule), "ask.system language rule");
              assert(
                systemPrompt.includes("RESEARCH CITATION RULES:") === researchAvailable,
                `ask.${researchAvailable ? "research" : "no-research"} citation rule gating`,
              );
              if (researchAvailable) assert(systemPrompt.includes("MATRIX RESEARCH"), "ask.research context");

              const output: Record<string, unknown> = {
                response: "r",
                followUpQuestions: [],
                uncertainties: [],
                citations: [{}],
                prosConsAnalysis: { pros: ["p"], cons: ["c"] },
                argumentMap: { mainClaim: "m", supportingPoints: [], counterpoints: [], assumptions: [] },
              };
              enforceAskControls(output, { mode, citationMode, prosConsMode, argumentMapMode });

              assert(
                citationMode
                  ? Array.isArray(output.citations) && output.citations.length === 1
                  : Array.isArray(output.citations) && output.citations.length === 0,
                `ask.${mode}.${citationMode ? "citation-on" : "citation-off"}`,
              );
              assert(
                prosConsMode === ("prosConsAnalysis" in output),
                `ask.${mode}.${prosConsMode ? "proscons-on" : "proscons-off"}`,
              );
              assert(
                argumentMapMode === ("argumentMap" in output),
                `ask.${mode}.${argumentMapMode ? "argumentmap-on" : "argumentmap-off"}`,
              );
              if (mode === "clarify") {
                const uncertainties = output.uncertainties as string[];
                assert(
                  uncertainties.includes("Clarify mode was requested, but no clarifying questions were returned."),
                  "ask.clarify missing follow-ups adds uncertainty",
                );
              }
            }
          }
        }
      }
    }
  }
});

Deno.test("only plain general ask mode is eligible for streaming", () => {
  for (const mode of ["clarify", "summarize", "proscons", "argumentmap"]) {
    assert(!isAskStreamingModeAllowed(mode), `ask.${mode} streaming bypass`);
  }
  assert(isAskStreamingModeAllowed("general"), "ask.general streaming eligibility");
});
