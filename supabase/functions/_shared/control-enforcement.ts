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
  if (!output || typeof output !== "object" || !("metadata" in output)) return;
  const generateOutput = output as {
    exordio?: unknown;
    contentions?: unknown[];
    metadata?: { side?: string; format?: string; generatedAt?: string };
  };
  if (!generateOutput.metadata) return;
  generateOutput.metadata.side = side === "con" ? "con" : "pro";
  generateOutput.metadata.format = format || "custom";
  if (role !== "intro" && "exordio" in generateOutput) {
    delete generateOutput.exordio;
  }
  if (Array.isArray(generateOutput.contentions)) {
    const target = length === "brief" ? 2 : length === "comprehensive" ? 4 : 3;
    generateOutput.contentions = generateOutput.contentions.slice(0, target);
  }
}
