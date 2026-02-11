export type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask";

const ASK_MODE_GUIDANCE: Record<string, string> = {
  general: "Give a balanced, practical coaching answer.",
  clarify: "Explain concepts simply and resolve ambiguity.",
  summarize: "Provide a concise summary with key takeaways.",
  proscons: "Structure the response around clear pros and cons.",
  argumentmap: "Map the claim, supports, counters, and assumptions explicitly.",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
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

export function getAskModeGuidance(mode: string): string {
  return ASK_MODE_GUIDANCE[mode] || ASK_MODE_GUIDANCE.general;
}

export function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string): string {
  if (feature === "generate") {
    const language = asString(input.language, "en");
    return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "auto")}
Format: ${asString(input.format, "custom")}
Role: ${asString(input.role, "intro")}
Length: ${asString(input.length, "standard")}
Audience: ${asString(input.audience, "intermediate")}
Tone: ${asString(input.tone, "formal")}
Language: ${languageLabel(language)} (${language})

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
    return `Find evidence for claim: "${asString(input.claim)}"

${searchContext}

Region: ${asString(input.region)}
Source Type: ${asString(input.sourceType, "any")}
Timeframe: ${asString(input.timeframe, "Recent (last 5 years)")}
Language: ${languageLabel(asString(input.language, "en"))} (${asString(input.language, "en")})`;
  }

  const mode = asString(input.mode, "general");
  return `Message: ${asString(input.message)}
Mode: ${mode}
Mode Guidance: ${getAskModeGuidance(mode)}`;
}
