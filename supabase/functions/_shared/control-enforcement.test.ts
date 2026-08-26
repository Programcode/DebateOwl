import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
  isAskStreamingModeAllowed,
} from "./control-enforcement.ts";

Deno.test("ask pros/cons and argument map toggles deterministically shape the output", () => {
  const output: Record<string, unknown> = {
    response: "r",
    followUpQuestions: [],
    uncertainties: [],
    prosConsAnalysis: { pros: ["p"], cons: ["c"] },
    argumentMap: { mainClaim: "m", supportingPoints: [], counterpoints: [], assumptions: [] },
  };
  enforceAskControls(output, { mode: "general" });
  if ("prosConsAnalysis" in output) throw new Error("pros/cons survived when toggle off");
  if ("argumentMap" in output) throw new Error("argument map survived when toggle off");

  const kept: Record<string, unknown> = {
    response: "r",
    followUpQuestions: [],
    uncertainties: [],
    prosConsAnalysis: { pros: ["p"], cons: ["c"] },
    argumentMap: { mainClaim: "m", supportingPoints: [], counterpoints: [], assumptions: [] },
  };
  enforceAskControls(kept, { mode: "general", prosConsMode: true, argumentMapMode: true });
  if (!("prosConsAnalysis" in kept) || !("argumentMap" in kept)) throw new Error("toggles on must keep sections");
});

Deno.test("clarify mode guarantees a visible uncertainty note when no follow-up questions came back", () => {
  const output: Record<string, unknown> = {
    response: "It depends on interpretation.",
    followUpQuestions: [],
    uncertainties: [] as string[],
  };
  enforceAskControls(output, { mode: "clarify" });
  const uncertainties = output.uncertainties as string[];
  if (uncertainties.length === 0) throw new Error("clarify without follow-ups must surface an uncertainty");

  const good: Record<string, unknown> = {
    response: "r",
    followUpQuestions: ["What ruleset are you debating?"],
    uncertainties: [] as string[],
  };
  enforceAskControls(good, { mode: "clarify" });
  if ((good.uncertainties as string[]).length !== 0) throw new Error("clarify with follow-ups must not add noise");
});

Deno.test("clarify mode is excluded from streaming while general mode remains eligible", () => {
  if (isAskStreamingModeAllowed("clarify")) throw new Error("clarify mode must not stream");
  if (!isAskStreamingModeAllowed("general")) throw new Error("general mode should remain streamable");
});

Deno.test("attack toggles zero out unrequested sections", () => {
  const output: Record<string, unknown> = {
    fallaciesDetected: [{ name: "ad hominem" }],
    weighingAnalysis: { currentWeighing: "x", missingComparisons: ["y"], improvementSuggestions: ["z"] },
  };
  enforceAttackControls(output, false, false);
  if ((output.fallaciesDetected as unknown[]).length !== 0) throw new Error("fallacies should be cleared");
  const weighing = output.weighingAnalysis as { currentWeighing: string; missingComparisons: string[] };
  if (weighing.missingComparisons.length !== 0 || !weighing.currentWeighing.includes("not requested")) {
    throw new Error("weighing should be replaced with a neutral placeholder");
  }
});

Deno.test("brainstorm output mode deletes non-requested shapes", () => {
  const output: Record<string, unknown> = {
    topFive: [{ rank: 1 }],
    mindmap: [{ category: "c", items: [] }],
    buckets: [{ name: "b", ideas: [] }],
  };
  enforceBrainstormControls(output, "both", "mindmap");
  if (!("mindmap" in output)) throw new Error("requested shape deleted");
  if ("topFive" in output || "buckets" in output) throw new Error("non-requested shapes kept");
});

Deno.test("generate controls pin metadata and trim contentions to the length target", () => {
  const output: Record<string, unknown> = {
    exordio: { hook: "h", transition: "t" },
    contentions: [{}, {}, {}, {}, {}],
    metadata: {},
  };
  enforceGenerateControls(output, "con", "custom", "brief", "r1");
  const meta = output.metadata as { side: string; format: string };
  if (meta.side !== "con") throw new Error("side not enforced");
  if ((output.contentions as unknown[]).length !== 2) throw new Error("brief must cap at 2 contentions");
  if ("exordio" in output) throw new Error("exordio must be removed for non-intro roles");

  const intro: Record<string, unknown> = {
    exordio: { hook: "h", transition: "t" },
    contentions: [{}, {}, {}],
    metadata: {},
  };
  enforceGenerateControls(intro, "pro", "custom", "standard", "intro");
  if (!("exordio" in intro)) throw new Error("intro role keeps a model-provided exordio");
});

Deno.test("generate controls fail closed when the model returns fewer contentions than requested", () => {
  const output: Record<string, unknown> = {
    contentions: [{}],
    metadata: {},
  };
  let error: unknown;
  try {
    enforceGenerateControls(output, "pro", "custom", "comprehensive", "r1");
  } catch (caught) {
    error = caught;
  }

  if (!(error instanceof Error) || !error.message.includes("requires exactly 4")) {
    throw new Error("underlength comprehensive output must be rejected");
  }
  if ((output.contentions as unknown[]).length !== 1) {
    throw new Error("underlength output must not be padded or fabricated");
  }
});

Deno.test("generate controls fail closed for missing or invalid exact-length fields", () => {
  const cases: Record<string, unknown>[] = [
    { contentions: [{}] },
    { metadata: {} },
    { metadata: {}, contentions: "one contention" },
  ];

  for (const output of cases) {
    let rejected = false;
    try {
      enforceGenerateControls(output, "pro", "custom", "brief", "r1");
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("malformed generate output must be rejected");
  }
});
