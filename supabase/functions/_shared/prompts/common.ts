// Shared prompt rules for every DebateLab AI feature: product identity,
// output language, the JSON contract, source bounds, and research citation
// honesty. Feature task prompts live in their own modules beside this one.

export type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring" | "crossfire";

export const ASK_COMMON_RULES = `You are DebateLab's debate coach.
Follow any explicit output-language instruction. Otherwise match the language used by the user.
Never invent facts, statistics, citations, or sources.
Prefer familiar words and short sentences. Explain specialist terms when needed.
Do not add jargon or formal filler just to sound expert.`;

export const PRODUCT_IDENTITY = `DEBATELAB PRODUCT IDENTITY:
${ASK_COMMON_RULES}
You prepare competitive debaters: cases, attacks, brainstorming, evidence, and coaching answers.
You write like a strong human debate coach, not a generic assistant. Be direct and concrete.
When evidence is unavailable or weak, say so plainly instead of fabricating support.

HUMANIZER STYLE INSTRUCTIONS:
- Follow the local humanizer.md rules: remove obvious AI-writing patterns and make the prose sound human, specific, and natural.
- Write like a strong human debate coach, not a generic AI assistant. Be direct and concrete.
- Avoid rhetorical flourishes.
- Avoid inflated significance claims, promotional language, vague expert attributions, superficial "-ing" analysis, forced rule-of-three phrasing, synonym cycling, chatbot filler, and generic upbeat conclusions.
- Vary sentence rhythm where prose is requested, but keep structured JSON fields concise.
- Do not use em dashes at all. Use commas, colons, parentheses, or separate sentences instead.
- Do not write parameter labels inside argument prose, for example "Magnitude:", "Probability:", or "Timeframe:".
- When the user needs debate material, write lines that can be spoken in round, not table notes or rubric fragments.`;

export const JSON_RULES = `OUTPUT RULES: Return ONLY a valid JSON object matching the schema in this prompt. No markdown fences, no commentary before or after the JSON. Required fields must always be present. When a field has no honest value, use the schema's allowed empty value, such as [] or null. Never omit required fields or invent placeholder content.`;

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  hu: "Hungarian",
};

export function outputLanguageInstruction(value: unknown): string {
  const language = typeof value === "string" && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, value) ? value : "en";
  return `Language: ${LANGUAGE_LABELS[language]} (${language}) - Write ALL output in this language.`;
}

export const MAX_PROMPT_SOURCE_COUNT = 10;
export const MAX_PROMPT_SOURCE_CHARS = 8_000;
export const MAX_PROMPT_SOURCE_TOTAL_CHARS = 24_000;
const MAX_PROMPT_SOURCE_TITLE_CHARS = 300;
const MAX_PROMPT_SOURCE_ORIGIN_CHARS = 500;
const MAX_PROMPT_SOURCE_TYPE_CHARS = 64;

export interface PromptSource {
  title: string;
  content: string;
  origin?: string;
  type: string;
}

/** Keep user-supplied library material within a predictable prompt budget. */
export function boundPromptSources(sources: unknown): PromptSource[] {
  if (!Array.isArray(sources)) return [];
  let remaining = MAX_PROMPT_SOURCE_TOTAL_CHARS;
  return sources.slice(0, MAX_PROMPT_SOURCE_COUNT).flatMap((source) => {
    if (remaining <= 0) return [];
    if (!source || typeof source !== "object" || Array.isArray(source)) return [];
    const record = source as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.content !== "string" || typeof record.type !== "string") return [];
    const title = record.title.trim().slice(0, MAX_PROMPT_SOURCE_TITLE_CHARS);
    const type = record.type.trim().slice(0, MAX_PROMPT_SOURCE_TYPE_CHARS);
    const content = record.content.slice(0, Math.min(MAX_PROMPT_SOURCE_CHARS, remaining));
    if (!title || !type || !content) return [];
    remaining -= content.length;
    const origin = typeof record.origin === "string"
      ? record.origin.trim().slice(0, MAX_PROMPT_SOURCE_ORIGIN_CHARS)
      : undefined;
    return [{ title, content, type, ...(origin ? { origin } : {}) }];
  });
}

export const RESEARCH_RULES = `RESEARCH CITATION RULES:
- Only sources marked 'strong' or 'moderate' may support factual claims or citations.
- Sources marked 'weak' are fallback context only. Never cite them as evidence; if only weak sources exist, state that evidence is limited.
- Never invent citations, URLs, statistics, or publication dates. Use only URLs that appear verbatim in the provided research context.
- If the research does not support a claim, leave the claim unsupported and note the gap in the designated uncertainty/warnings fields.`;

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
