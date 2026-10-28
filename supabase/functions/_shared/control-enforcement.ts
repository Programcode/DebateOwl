// Deterministic post-processing that makes user controls honest: each
// function enforces the requested output shape regardless of what the model
// returned. Tested by _shared/control-enforcement.test.ts and
// ai/control-matrix.test.ts.

export interface AskControls {
  mode: string;
  citationMode?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
}

export function isAskStreamingModeAllowed(mode: unknown): boolean {
  return mode === "general";
}

const ENUM_CONTROLS: Record<string, Record<string, readonly string[]>> = {
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
};

const BOOLEAN_CONTROLS: Record<string, readonly string[]> = {
  ask: ["citationMode", "webSearch", "prosConsMode", "argumentMapMode"],
  attack: ["detectFallacies", "analyzeWeighing"],
};

const SUPPORTED_LANGUAGES = new Set(["en", "es", "hu"]);

/** Returns a safe client-facing error for malformed, present AI controls. */
export function validateControlInput(feature: string, input: Record<string, unknown>): string | null {
  if (Object.hasOwn(input, "language") &&
    (typeof input.language !== "string" || !SUPPORTED_LANGUAGES.has(input.language))) {
    return `${feature}.language is invalid`;
  }

  for (const [name, allowed] of Object.entries(ENUM_CONTROLS[feature] ?? {})) {
    if (Object.hasOwn(input, name) && (typeof input[name] !== "string" || !allowed.includes(input[name]))) {
      return `${feature}.${name} is invalid`;
    }
  }

  for (const name of BOOLEAN_CONTROLS[feature] ?? []) {
    if (Object.hasOwn(input, name) && typeof input[name] !== "boolean") {
      return `${feature}.${name} must be a boolean`;
    }
  }

  if (feature === "factoids") {
    if (Object.hasOwn(input, "timeframe") && typeof input.timeframe !== "string") {
      return "factoids.timeframe must be a string";
    }
    if (Object.hasOwn(input, "sourceCount") &&
      (typeof input.sourceCount !== "number" || !Number.isInteger(input.sourceCount) || input.sourceCount < 3 || input.sourceCount > 15)) {
      return "factoids.sourceCount must be an integer from 3 to 15";
    }
  }

  return null;
}

const CLARIFY_NOTE = "Clarify mode was requested, but no clarifying questions were returned.";

export function enforceAskControls(output: unknown, controls: AskControls): void {
  if (!output || typeof output !== "object") return;
  const askOutput = output as {
    citations?: unknown[];
    prosConsAnalysis?: unknown;
    argumentMap?: unknown;
    followUpQuestions?: unknown;
    uncertainties?: string[];
  };

  // Missing toggle keys mean the control is off, matching request payloads.
  if (controls.citationMode !== true) {
    askOutput.citations = [];
  }
  if (controls.prosConsMode !== true) {
    delete askOutput.prosConsAnalysis;
  }
  if (controls.argumentMapMode !== true) {
    delete askOutput.argumentMap;
  }
  if (controls.mode === "clarify") {
    const hasFollowUps = Array.isArray(askOutput.followUpQuestions) && askOutput.followUpQuestions.length > 0;
    if (!hasFollowUps) {
      const uncertainties = Array.isArray(askOutput.uncertainties) ? askOutput.uncertainties : [];
      if (!uncertainties.includes(CLARIFY_NOTE)) uncertainties.push(CLARIFY_NOTE);
      askOutput.uncertainties = uncertainties;
    }
  }
}

export function enforceAttackControls(output: unknown, detectFallacies: boolean, analyzeWeighing: boolean) {
  if (!output || typeof output !== "object") return;
  const attackOutput = output as {
    fallaciesDetected?: unknown[];
    weighingAnalysis?: { currentWeighing?: string; missingComparisons?: string[]; improvementSuggestions?: string[] };
  };

  if (!detectFallacies) {
    attackOutput.fallaciesDetected = [];
  }
  if (!analyzeWeighing) {
    attackOutput.weighingAnalysis = {
      currentWeighing: "Weighing analysis was not requested.",
      missingComparisons: [],
      improvementSuggestions: [],
    };
  }
}

export function enforceBrainstormControls(output: unknown, _side: string, outputMode: string) {
  if (!output || typeof output !== "object") return;
  const brainstormOutput = output as {
    topFive?: unknown;
    mindmap?: unknown;
    buckets?: unknown;
  };
  // The prompt already controls side. Post-filtering by side can erase useful
  // neutral or comparative ideas, so only enforce the requested output mode.

  if (outputMode !== "topfive") delete brainstormOutput.topFive;
  if (outputMode !== "mindmap") delete brainstormOutput.mindmap;
  if (outputMode !== "buckets") delete brainstormOutput.buckets;
}

export function enforceGenerateControls(output: unknown, side: string, format: string, length: string, role: string) {
  if (!output || typeof output !== "object" || !("metadata" in output)) {
    throw new Error("Generate response is missing metadata and cannot satisfy the requested output shape.");
  }
  const generateOutput = output as {
    exordio?: unknown;
    opening?: unknown;
    contentions?: unknown[];
    counters?: unknown[];
    whyWeWin?: unknown;
    reinforce?: unknown;
    metadata?: { side?: string; format?: string; generatedAt?: string };
  };
  if (!generateOutput.metadata || typeof generateOutput.metadata !== "object" || Array.isArray(generateOutput.metadata)) {
    throw new Error("Generate response contains invalid metadata and cannot satisfy the requested output shape.");
  }

  generateOutput.metadata.side = side === "con" ? "con" : "pro";
  generateOutput.metadata.format = format || "custom";
  if (role !== "intro" && "exordio" in generateOutput) {
    delete generateOutput.exordio;
  }
  // Only the Introductor may define a motion term, and only in one line.
  const opening = generateOutput.opening;
  if (role !== "intro" && opening && typeof opening === "object" && !Array.isArray(opening)) {
    delete (opening as { definition?: unknown }).definition;
  }

  // The prompt asks for whyItMatters; saved cases keep it under impact.
  if (Array.isArray(generateOutput.contentions)) {
    for (const contention of generateOutput.contentions) {
      if (!contention || typeof contention !== "object") continue;
      const item = contention as { impact?: unknown; whyItMatters?: unknown };
      if (item.impact === undefined && typeof item.whyItMatters === "string") item.impact = item.whyItMatters;
      delete item.whyItMatters;
    }
  }

  // R2 brings no new arguments: it backs up the team's earlier ones, then
  // spends most of the speech on "If they say…" answers.
  if (role === "r2") {
    const reinforce = Array.isArray(generateOutput.reinforce)
      ? generateOutput.reinforce.filter((item) =>
        item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" && (item as { text: string }).text.trim())
      : [];
    const answers = Array.isArray(generateOutput.counters) ? generateOutput.counters : [];
    // One full answer for each thing they are likely to say: their main
    // arguments, supporting points and answers to our case.
    const target = length === "brief" ? 5 : 6;
    if (reinforce.length < 1) {
      throw new Error("Generate response returned no reinforce items, but R2 must back up the team's arguments.");
    }
    if (answers.length < 4) {
      throw new Error(`Generate response returned ${answers.length} counters, but R2 needs ${target}.`);
    }
    generateOutput.reinforce = reinforce.slice(0, 3);
    generateOutput.counters = answers.slice(0, target);
    generateOutput.contentions = [];
    delete generateOutput.whyWeWin;
    return;
  }
  delete generateOutput.reinforce;

  // The Conclusor brings no new arguments: 2-3 reasons we win replace them.
  if (role === "conc") {
    const reasons = Array.isArray(generateOutput.whyWeWin)
      ? generateOutput.whyWeWin.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const target = length === "brief" ? 2 : 3;
    if (reasons.length < 2) {
      throw new Error(`Generate response returned ${reasons.length} reasons why we win, but the Conclusor needs ${target}.`);
    }
    generateOutput.whyWeWin = reasons.slice(0, target);
    generateOutput.contentions = [];
    generateOutput.counters = [];
    return;
  }
  delete generateOutput.whyWeWin;

  if (!Array.isArray(generateOutput.contentions)) {
    throw new Error("Generate response is missing a valid contentions array and cannot satisfy the requested output shape.");
  }
  if (!Array.isArray(generateOutput.counters)) generateOutput.counters = [];
  const target = length === "brief" ? 2 : length === "comprehensive" ? 4 : 3;
  if (generateOutput.contentions.length < target) {
    throw new Error(
      `Generate response returned ${generateOutput.contentions.length} contentions, but length ${length || "standard"} requires exactly ${target}.`,
    );
  }
  generateOutput.contentions = generateOutput.contentions.slice(0, target);
}

const MAX_CASE_SOURCES = 12;

function comparableUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Keeps the case's sources list honest: a link survives only when the research
 * or the student's Library supplied it, so a link the model made up never
 * reaches the page or an export. The organisation, year and claim stay.
 */
export function enforceGenerateSources(output: unknown, knownUrls: Iterable<string>) {
  if (!output || typeof output !== "object" || !("sources" in output)) return;
  const generateOutput = output as { sources?: unknown };
  if (!Array.isArray(generateOutput.sources)) {
    delete generateOutput.sources;
    return;
  }
  const known = new Set([...knownUrls].map(comparableUrl).filter((url): url is string => Boolean(url)));
  generateOutput.sources = generateOutput.sources.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const source = value as Record<string, unknown>;
    const org = typeof source.org === "string" ? source.org.trim() : "";
    const claim = typeof source.claim === "string" ? source.claim.trim() : "";
    if (!org && !claim) return [];
    const year = typeof source.year === "string" || typeof source.year === "number" ? String(source.year).trim() : "";
    const url = typeof source.url === "string" ? comparableUrl(source.url) : undefined;
    return [{
      org,
      claim,
      ...(year ? { year } : {}),
      ...(url && known.has(url) ? { url: (source.url as string).trim() } : {}),
    }];
  }).slice(0, MAX_CASE_SOURCES);
}
