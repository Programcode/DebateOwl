// Prompt size and caching limits for the AI Edge Functions. Every number here
// sets how many input tokens a request pays for, so raise them deliberately.

/** Characters kept from each fetched web page: research reads and links pasted into Ask. */
export const MAX_FETCHED_PAGE_CHARS = 2_000;

/** Search snippets rendered into a research prompt, besides the pages read in full. */
export const MAX_RESEARCH_SNIPPETS = 12;

/** Earlier chat messages an Ask request sends to the model. */
export const MAX_ASK_HISTORY_MESSAGES = 6;

/** Characters kept from each earlier Ask message. */
export const MAX_ASK_HISTORY_MESSAGE_CHARS = 6_000;

/** Characters of pasted-page and research context a non-streamed Ask request may carry. */
export const MAX_ASK_CONTEXT_CHARS = 32_000;

/**
 * Mark the system prompt cacheable for Anthropic models. OpenRouter passes the
 * breakpoint to Anthropic, which bills a repeat of the same prefix within five
 * minutes at a tenth of the input price. Prompts below the model's minimum
 * cacheable length are sent uncached at the normal price.
 */
export const ANTHROPIC_PROMPT_CACHING = true;

type ChatMessage = { role: string; content: string };
type CacheableMessage = ChatMessage | {
  role: string;
  content: Array<{ type: "text"; text: string; cache_control: { type: "ephemeral" } }>;
};

/** Adds an Anthropic cache breakpoint to the system message; other models get the messages unchanged. */
export function withPromptCaching(model: string, messages: ChatMessage[]): CacheableMessage[] {
  if (!ANTHROPIC_PROMPT_CACHING || !model.startsWith("anthropic/")) return messages;
  return messages.map((message) => message.role === "system"
    ? { role: "system", content: [{ type: "text", text: message.content, cache_control: { type: "ephemeral" } }] }
    : message);
}

/** The last earlier messages of an Ask conversation, each cut to the per-message cap. */
export function boundAskHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_ASK_HISTORY_MESSAGES).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content) return [];
    return [{ role, content: content.slice(0, MAX_ASK_HISTORY_MESSAGE_CHARS) }];
  });
}
