// Size bounds for the student's Library sources in a prompt. Pure, so the
// browser can preview exactly what the server will keep.

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
