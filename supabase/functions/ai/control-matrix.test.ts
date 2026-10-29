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
} from "../_shared/control-enforcement.ts";
import { buildSearchRequests } from "../_shared/source-quality.ts";

function assertIncludes(text: string, expected: string, label: string) {
  if (!text.includes(expected)) throw new Error(`[${label}] prompt missing "${expected}"`);
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`[${label}] behavioral effect missing`);
}

Deno.test("generate length and role controls preserve the output contract", () => {
  const targets = { brief: 2, standard: 3, comprehensive: 4 } as const;
  for (const length of ["brief", "standard", "comprehensive"] as const) {
    for (const role of ["intro", "r1", "r2", "conc"] as const) {
      const output: Record<string, unknown> = {
        exordio: { hook: "hook", transition: "transition" },
        opening: { hook: "hook", definition: "definition" },
        contentions: [{}, {}, {}, {}],
        counters: Array.from({ length: 14 }, () => ({})),
        reinforce: [{ argument: "Our first argument", text: "backed up" }, { argument: "", text: "  " }],
        whyWeWin: ["a", "b", "c", "d"],
        metadata: {},
      };
      enforceGenerateControls(output, "pro", "custom", length, role);
      if (role === "r2") {
        // R2 brings no new arguments: it backs up the team's and answers theirs.
        assert((output.contentions as unknown[]).length === 0, `generate.${length}.r2 has no contentions`);
        assert((output.reinforce as unknown[]).length === 1, `generate.${length}.r2 keeps only reinforce items with text`);
        assert((output.counters as unknown[]).length === (length === "brief" ? 10 : 12), `generate.${length}.r2 answer count`);
        assert(!("whyWeWin" in output), "generate.r2 has no whyWeWin");
      } else if (role === "conc") {
        // The Conclusor brings 2-3 reasons we win and no new arguments.
        assert((output.contentions as unknown[]).length === 0, `generate.${length}.conc has no contentions`);
        assert((output.counters as unknown[]).length === 0, `generate.${length}.conc has no counters`);
        assert((output.whyWeWin as unknown[]).length === (length === "brief" ? 2 : 3), `generate.${length}.conc whyWeWin count`);
      } else {
        assert((output.contentions as unknown[]).length === targets[length], `generate.${length} output count`);
        assert(!("whyWeWin" in output), `generate.${role} has no whyWeWin`);
        assert(!("reinforce" in output), `generate.${role} has no reinforce`);
      }
      assert((role === "intro") === ("exordio" in output), `generate.${role} exordio shape`);
      assert((role === "intro") === ("definition" in (output.opening as object)), `generate.${role} definition only for the Introductor`);
    }
  }
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
