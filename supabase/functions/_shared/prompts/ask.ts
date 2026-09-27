// Ask: a coaching chat answer in the requested mode, JSON or streamed.

import { ASK_COMMON_RULES, asString, outputLanguageInstruction } from "./common.ts";

export const ASK_PROMPT = `You are a debate coach chat bot. Answer the user's question.

[DATE_CONTEXT]

Output JSON matching:
{
  "response": "string (markdown supported)",
  "citations": [{ "claim": "string", "source": "string", "verified": boolean, "note": "string" }],
  "searchInfo": { "webSearchUsed": boolean, "queries": ["string"], "sources": [{ "title": "string", "url": "string", "verified": boolean }] },
  "followUpQuestions": ["string"],
  "uncertainties": ["string"],
  "prosConsAnalysis": { "pros": ["string"], "cons": ["string"] },
  "argumentMap": { "mainClaim": "string", "supportingPoints": ["string"], "counterpoints": ["string"], "assumptions": ["string"] }
}

Rules:
- Always return valid JSON with response, followUpQuestions, and uncertainties. Use [] when there are no follow-up questions or uncertainties.
- Answer the user's question first in plain language. Add detail only when it helps.
- The server fills searchInfo after your response. Do not fabricate searchInfo.
- If Mode is clarify, make the response explain the unclear parts and include follow-up questions that would resolve ambiguity.
- If Citation Mode is ON, include citations for factual claims when WEB RESEARCH RESULTS or WEB PAGE CONTEXT provide sources. Use exact URLs when available.
- If Citation Mode is OFF, set citations to [] unless the user explicitly asks for sources.`;

const ASK_MODE_GUIDANCE: Record<string, string> = {
  general: "Give a direct coaching answer with concrete debate tactics and no forced extra sections.",
  clarify: "Define unclear terms, identify ambiguities, explain what changes based on each interpretation, and include follow-up questions.",
  summarize: "Provide a concise summary with key takeaways and no new claims.",
  proscons: "Structure the response around clear pros and cons and include prosConsAnalysis.",
  argumentmap: "Map the claim, supports, counters, and assumptions explicitly and include argumentMap.",
};

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

export function buildStreamingAskSystemPrompt(modeGuidance: string, language: unknown = "en"): string {
  return [
    ASK_COMMON_RULES,
    outputLanguageInstruction(language),
    "Answer in clear Markdown that can stream smoothly token by token.",
    "Be direct, concrete, and honest about uncertainty.",
    "If the user asks for sources, explain that citation/search mode should be used.",
    `Mode guidance: ${modeGuidance}`,
  ].join("\n");
}

export function buildAskUserPrompt(input: Record<string, unknown>): string {
const mode = asString(input.mode, "general");
return `Message: ${asString(input.message)}
Mode: ${mode}
Mode Guidance: ${getAskModeGuidance(mode)}
${outputLanguageInstruction(input.language)}`;
}
