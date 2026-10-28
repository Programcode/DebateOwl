import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
  enforceGenerateSources,
  isAskStreamingModeAllowed,
  validateControlInput,
} from "./control-enforcement.ts";

const ENUM_CONTROLS = {
  ask: {
    mode: ["general", "clarify", "summarize", "proscons", "argumentmap"],
  },
  attack: {
    aggressiveness: ["mild", "moderate", "ruthless"],
    judgeParadigm: ["logic", "values", "policy"],
  },
  brainstorm: {
    side: ["pro", "con", "both"],
    outputMode: ["mindmap", "buckets", "topfive"],
  },
  factoids: {
    direction: ["for", "against"],
    sourceType: ["academic", "government", "news", "any"],
  },
  generate: {
    side: ["pro", "con"],
    format: ["custom", "bp", "policy", "classroom"],
    role: ["intro", "r1", "r2", "conc", "general"],
    length: ["brief", "standard", "comprehensive"],
    audience: ["beginner", "intermediate", "advanced"],
    tone: ["formal", "conversational", "aggressive"],
  },
} as const;

const BOOLEAN_CONTROLS = {
  ask: ["citationMode", "webSearch", "prosConsMode", "argumentMapMode"],
  attack: ["detectFallacies", "analyzeWeighing"],
} as const;

Deno.test("control validator accepts every enum value and omitted defaults", () => {
  for (const [feature, controls] of Object.entries(ENUM_CONTROLS)) {
    if (validateControlInput(feature, {}) !== null) throw new Error(`${feature} rejected omitted controls`);
    for (const [control, values] of Object.entries(controls)) {
      for (const value of values) {
        const error = validateControlInput(feature, { [control]: value });
        if (error !== null) throw new Error(`${feature}.${control} rejected ${value}: ${error}`);
      }
    }
  }
});

Deno.test("control validator accepts supported languages and rejects invalid language values", () => {
  for (const feature of ["generate", "attack", "brainstorm", "factoids", "ask", "sparring", "crossfire"]) {
    if (validateControlInput(feature, {}) !== null) throw new Error(`${feature} rejected omitted language`);
    for (const language of ["en", "es", "hu"]) {
      if (validateControlInput(feature, { language }) !== null) throw new Error(`${feature} rejected ${language}`);
    }
    for (const language of ["zz", 7, null]) {
      const error = validateControlInput(feature, { language });
      if (!error?.includes(`${feature}.language`)) throw new Error(`${feature} accepted ${String(language)}`);
    }
  }
});

Deno.test("control validator rejects every unsupported enum", () => {
  for (const [feature, controls] of Object.entries(ENUM_CONTROLS)) {
    for (const control of Object.keys(controls)) {
      const error = validateControlInput(feature, { [control]: "unsupported" });
      if (!error?.includes(`${feature}.${control}`)) throw new Error(`${feature}.${control} accepted an unsupported value`);
    }
  }
});

Deno.test("control validator accepts booleans and rejects wrong boolean types", () => {
  for (const [feature, controls] of Object.entries(BOOLEAN_CONTROLS)) {
    for (const control of controls) {
      for (const value of [true, false]) {
        if (validateControlInput(feature, { [control]: value }) !== null) {
          throw new Error(`${feature}.${control} rejected ${value}`);
        }
      }
      const error = validateControlInput(feature, { [control]: "false" });
      if (!error?.includes(`${feature}.${control}`)) throw new Error(`${feature}.${control} accepted a string boolean`);
    }
  }
});

Deno.test("factoids typed controls enforce their existing boundaries", () => {
  for (const sourceCount of [3, 5, 15]) {
    if (validateControlInput("factoids", { sourceCount }) !== null) throw new Error(`rejected sourceCount ${sourceCount}`);
  }
  if (validateControlInput("factoids", { timeframe: "2020-2026" }) !== null) throw new Error("rejected string timeframe");

  for (const input of [
    { sourceCount: "5" },
    { sourceCount: 3.5 },
    { sourceCount: Number.NaN },
    { sourceCount: Number.POSITIVE_INFINITY },
    { sourceCount: 2 },
    { sourceCount: 16 },
    { timeframe: 2026 },
  ]) {
    if (validateControlInput("factoids", input) === null) {
      throw new Error(`accepted invalid factoids control ${JSON.stringify(input)}`);
    }
  }
  if (validateControlInput("unknown", { mode: "unsupported" }) !== null) throw new Error("unknown feature must be ignored");
});

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

Deno.test("only general ask mode is eligible for streaming", () => {
  for (const mode of ["clarify", "summarize", "proscons", "argumentmap", "unsupported", undefined]) {
    if (isAskStreamingModeAllowed(mode)) throw new Error(`${mode} mode must not stream`);
  }
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

Deno.test("a Conclusor case without at least two reasons we win is rejected, not padded", () => {
  for (const whyWeWin of [undefined, [], ["only one"], ["", "  ", "one"], "not a list"]) {
    const output: Record<string, unknown> = { contentions: [{}, {}, {}], whyWeWin, metadata: {} };
    let error: unknown;
    try {
      enforceGenerateControls(output, "pro", "custom", "standard", "conc");
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof Error) || !error.message.includes("Conclusor")) {
      throw new Error(`conc output with whyWeWin=${JSON.stringify(whyWeWin)} must be rejected`);
    }
  }
});

Deno.test("an R2 case must back up the team's arguments and answer theirs, or it is rejected", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["no reinforce", { reinforce: [], counters: [{}, {}, {}, {}, {}], contentions: [], metadata: {} }],
    ["only blank reinforce", { reinforce: [{ argument: "Our first", text: "  " }], counters: [{}, {}, {}, {}, {}], contentions: [], metadata: {} }],
    ["too few answers", { reinforce: [{ argument: "Our first", text: "Backed up." }], counters: [{}], contentions: [], metadata: {} }],
  ];
  for (const [label, output] of cases) {
    let rejected = false;
    try {
      enforceGenerateControls(output, "con", "custom", "standard", "r2");
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`R2 output with ${label} must be rejected`);
  }

  // New arguments from the model are dropped: R2 brings none.
  const output: Record<string, unknown> = {
    reinforce: [{ argument: "Our first", text: "Backed up." }],
    counters: [{}, {}, {}],
    contentions: [{ claim: "A new point", whyItMatters: "x" }],
    metadata: {},
  };
  enforceGenerateControls(output, "con", "custom", "standard", "r2");
  if ((output.contentions as unknown[]).length !== 0) throw new Error("R2 must not keep new arguments");
});

Deno.test("why it matters is filed under the key saved cases already use", () => {
  const output: Record<string, unknown> = {
    contentions: [{ claim: "a", whyItMatters: "People reach work." }, { claim: "b", impact: "Kept.", whyItMatters: "Ignored." }],
    metadata: {},
  };
  enforceGenerateControls(output, "pro", "custom", "brief", "r1");
  const [first, second] = output.contentions as Array<Record<string, unknown>>;
  if (first.impact !== "People reach work." || "whyItMatters" in first) throw new Error("whyItMatters must move to impact");
  if (second.impact !== "Kept." || "whyItMatters" in second) throw new Error("an existing impact must win");
});

Deno.test("case sources keep only links the research or Library supplied", () => {
  const output: Record<string, unknown> = {
    sources: [
      { org: "UNICEF", year: 2025, claim: "Age limits alone do not keep children safe", url: "https://www.unicef.org/report#section" },
      { org: "Made Up Institute", year: "2024", claim: "Invented figure", url: "https://made-up.example/study" },
      { org: "Library page", claim: "From the student's sources", url: "https://library.example/page/" },
      { org: "Script", claim: "Not a web link", url: "javascript:alert(1)" },
      { org: "", claim: "" },
      "not a source",
      { org: "Educo", claim: "1 in 5 pupils are bullied" },
    ],
  };
  enforceGenerateSources(output, ["https://www.unicef.org/report", "https://library.example/page"]);
  const sources = output.sources as Array<Record<string, unknown>>;
  const expected = [
    { org: "UNICEF", claim: "Age limits alone do not keep children safe", year: "2025", url: "https://www.unicef.org/report#section" },
    { org: "Made Up Institute", claim: "Invented figure", year: "2024" },
    { org: "Library page", claim: "From the student's sources", url: "https://library.example/page/" },
    { org: "Script", claim: "Not a web link" },
    { org: "Educo", claim: "1 in 5 pupils are bullied" },
  ];
  if (JSON.stringify(sources) !== JSON.stringify(expected)) {
    throw new Error(`unexpected sources: ${JSON.stringify(sources)}`);
  }

  const malformed: Record<string, unknown> = { sources: "UNICEF 2025" };
  enforceGenerateSources(malformed, []);
  if ("sources" in malformed) throw new Error("a non-list sources field must be removed");
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
