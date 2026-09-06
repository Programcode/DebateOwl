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

/** Returns a safe client-facing error for malformed, present AI controls. */
export function validateControlInput(feature: string, input: Record<string, unknown>): string | null {
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
      (typeof input.sourceCount !== "number" || !Number.isFinite(input.sourceCount) || input.sourceCount < 3 || input.sourceCount > 15)) {
      return "factoids.sourceCount must be a number from 3 to 15";
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
    contentions?: unknown[];
    metadata?: { side?: string; format?: string; generatedAt?: string };
  };
  if (!generateOutput.metadata || typeof generateOutput.metadata !== "object" || Array.isArray(generateOutput.metadata)) {
    throw new Error("Generate response contains invalid metadata and cannot satisfy the requested output shape.");
  }
  if (!Array.isArray(generateOutput.contentions)) {
    throw new Error("Generate response is missing a valid contentions array and cannot satisfy the requested output shape.");
  }

  generateOutput.metadata.side = side === "con" ? "con" : "pro";
  generateOutput.metadata.format = format || "custom";
  if (role !== "intro" && "exordio" in generateOutput) {
    delete generateOutput.exordio;
  }
  const target = length === "brief" ? 2 : length === "comprehensive" ? 4 : 3;
  if (generateOutput.contentions.length < target) {
    throw new Error(
      `Generate response returned ${generateOutput.contentions.length} contentions, but length ${length || "standard"} requires exactly ${target}.`,
    );
  }
  generateOutput.contentions = generateOutput.contentions.slice(0, target);
}
