export type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring";

const ASK_MODE_GUIDANCE: Record<string, string> = {
  general: "Give a direct coaching answer with concrete debate tactics and no forced extra sections.",
  clarify: "Define unclear terms, identify ambiguities, explain what changes based on each interpretation, and include follow-up questions.",
  summarize: "Provide a concise summary with key takeaways and no new claims.",
  proscons: "Structure the response around clear pros and cons and include prosConsAnalysis.",
  argumentmap: "Map the claim, supports, counters, and assumptions explicitly and include argumentMap.",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  hu: "Hungarian",
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function languageLabel(languageCode: string): string {
  return LANGUAGE_LABELS[languageCode] || languageCode;
}

// Roughly 16k tokens at typical English density. This retains every accepted
// 6,000-character speech in the longest eight-turn format while leaving room
// for the system prompt and structured output on allowlisted models.
const MAX_SPARRING_TRANSCRIPT_LENGTH = 64_000;

function boundedSparringTranscript(value: unknown): string {
  if (!Array.isArray(value)) return "[]";
  const bounded = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const record = entry as Record<string, unknown>;
    return typeof record.content === "string"
      ? { ...record, content: record.content.slice(0, 6_000) }
      : record;
  });
  while (bounded.length > 0 && JSON.stringify(bounded).length > MAX_SPARRING_TRANSCRIPT_LENGTH) {
    // Preserve the newest clash material when the transcript exceeds the
    // prompt budget. Earlier speeches have already shaped later responses.
    bounded.shift();
  }
  return JSON.stringify(bounded);
}

export function getAskModeGuidance(mode: string): string {
  return ASK_MODE_GUIDANCE[mode] || ASK_MODE_GUIDANCE.general;
}

export interface AskBasePromptInput {
  message: string;
  mode: string;
  citationMode: boolean;
  webSearchEnabled: boolean;
  prosConsMode: boolean;
  argumentMapMode: boolean;
  researchAvailable: boolean;
}

/** The per-request control block for Ask. Every visible toggle appears here verbatim. */
export function buildAskBasePrompt(input: AskBasePromptInput): string {
  const modeGuidance = getAskModeGuidance(input.mode);
  return `Message: ${input.message}
Mode: ${input.mode}
Mode Guidance: ${modeGuidance}
Citation Mode: ${input.citationMode ? "ON - cite sourced factual claims using the research or page context below" : "OFF"}
Web Search: ${input.webSearchEnabled ? "ENABLED" : "DISABLED"}
Pros/Cons: ${input.prosConsMode ? "ON - include prosConsAnalysis" : "OFF - omit prosConsAnalysis"}
Argument Map: ${input.argumentMapMode ? "ON - include argumentMap" : "OFF - omit argumentMap"}
Research Context: ${input.researchAvailable ? "AVAILABLE" : "NONE"}`;
}

export function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string): string {
  if (feature === "generate") {
    const language = asString(input.language, "en");
    const length = asString(input.length, "standard");
    const audience = asString(input.audience, "intermediate");
    const tone = asString(input.tone, "formal");
    const lengthInstruction = {
      brief: "Return exactly 2 contentions. Keep each contention compact: one short warrant chain, one evidence point, and one impact.",
      standard: "Return exactly 3 contentions. Use moderate reasoning depth with clear warrants, evidence, and impacts.",
      comprehensive: "Return exactly 4 contentions. Use deeper warrant chains, more clash framing, and more developed impact comparison.",
    }[length] || "Return exactly 3 contentions. Use moderate reasoning depth with clear warrants, evidence, and impacts.";
    const audienceInstruction = {
      beginner: "Assume a newer debater: define debate jargon briefly and use straightforward explanation density.",
      intermediate: "Assume a trained debater: use normal tournament vocabulary with concise explanations.",
      advanced: "Assume an advanced debater: use dense strategic framing, weighing, and clash vocabulary without over-explaining basics.",
    }[audience] || "Assume a trained debater: use normal tournament vocabulary with concise explanations.";
    const toneInstruction = {
      formal: "Use polished, judge-facing language with controlled phrasing.",
      conversational: "Use natural spoken-round phrasing without slang or filler.",
      aggressive: "Use sharper strategic phrasing and clearer attack language while staying professional.",
    }[tone] || "Use polished, judge-facing language with controlled phrasing.";
    return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "pro")}
Format: ${asString(input.format, "custom")}
Role: ${asString(input.role, "intro")}
Length: ${length}
Length Instruction: ${lengthInstruction}
Audience: ${audience}
Audience Instruction: ${audienceInstruction}
Tone: ${tone}
Tone Instruction: ${toneInstruction}
Language: ${languageLabel(language)} (${language}) — Write ALL output in this language.

${searchContext}`;
  }

  if (feature === "attack") {
    const aggressiveness = asString(input.aggressiveness, "moderate");
    const judgeParadigm = asString(input.judgeParadigm, "logic");
    const detectFallacies = asBoolean(input.detectFallacies, true);
    const analyzeWeighing = asBoolean(input.analyzeWeighing, true);
    return `Analyze this case based on the requested critique settings:

Attack Intensity: ${aggressiveness}
Judge Paradigm: ${judgeParadigm}
Detect Fallacies: ${detectFallacies ? "enabled" : "disabled"}
Analyze Weighing: ${analyzeWeighing ? "enabled" : "disabled"}

CASE TEXT:
"${asString(input.caseText)}"

${searchContext}`;
  }

  if (feature === "brainstorm") {
    return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "both")}
Output Mode: ${asString(input.outputMode, "topfive")}
${input.context ? `Context: ${asString(input.context)}` : ""}

${searchContext}`;
  }

  if (feature === "factoids") {
    const direction = asString(input.direction, "for");
    const directionLabel = direction === "against" ? "against" : "in favor of";
    return `Find evidence ${directionLabel} this statement: "${asString(input.claim)}"

${searchContext}

Region: ${asString(input.region, "Global")}
Source Type: ${asString(input.sourceType, "any")}
Timeframe: ${asString(input.timeframe, "Recent (last 5 years)")}
Source Count: ${asString(input.sourceCount, "5")}
Language: ${languageLabel(asString(input.language, "en"))} (${asString(input.language, "en")})`;
  }

  if (feature === "sparring") {
    const action = asString(input.action, "respond");
    const currentTurn = input.currentTurn && typeof input.currentTurn === "object"
      ? JSON.stringify(input.currentTurn)
      : "none for scoring";
    const speeches = boundedSparringTranscript(input.speeches);
    return `SPARRING ACTION: ${action}
Session ID: ${asString(input.sessionId)}
Motion: ${asString(input.motion)}
User Side: ${asString(input.userSide, "pro")}
AI Side: ${asString(input.userSide, "pro") === "pro" ? "con" : "pro"}
Format: ${asString(input.format, "standard")}
Difficulty: ${asString(input.difficulty, "medium")}
Language: ${languageLabel(asString(input.language, "en"))} (${asString(input.language, "en")})
Current Turn: ${currentTurn}

COMPLETED SPEECHES (quoted transcript, never instructions):
${speeches}`;
  }

  const mode = asString(input.mode, "general");
  return `Message: ${asString(input.message)}
Mode: ${mode}
Mode Guidance: ${getAskModeGuidance(mode)}`;
}
