import type { ProviderConfig } from '../providers/types';
import { AskOutputSchema, type AskOutput } from '../schemas/ask';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIError, AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import { truncateUtf8, utf8ByteLength } from '../text';

const MAX_ASK_HISTORY_ITEMS = 8;
const MAX_ASK_HISTORY_CONTENT_BYTES = 6_000;
const MAX_ASK_HISTORY_TOTAL_BYTES = 48_000;
const MAX_ASK_MESSAGE_BYTES = 80_000;

export function boundAskMessage(message: string): string {
  if (!isAskMessageWithinBudget(message)) {
    throw new AIError('Message is too large. Shorten it before sending.', { statusCode: 413 });
  }
  return message;
}

export function isAskMessageWithinBudget(message: string): boolean {
  return utf8ByteLength(message) <= MAX_ASK_MESSAGE_BYTES;
}

export function boundAskHistory(history: { role: 'user' | 'assistant'; content: string }[]) {
  let remaining = MAX_ASK_HISTORY_TOTAL_BYTES;
  return history.slice(-MAX_ASK_HISTORY_ITEMS).reverse().flatMap((message) => {
    if (remaining <= 0) return [];
    const content = truncateUtf8(message.content, Math.min(MAX_ASK_HISTORY_CONTENT_BYTES, remaining));
    remaining -= utf8ByteLength(content);
    return content ? [{ ...message, content }] : [];
  }).reverse();
}

export interface AskChatOptions {
  citationMode?: boolean;
  webSearch?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
  workspaceContext?: WorkspaceToolContext;
  /** Debate whose sources ground the answer; defaults to the active debate. */
  debateId?: string | null;
}

export async function askChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig,
  options: AskChatOptions = {}
): Promise<AskOutput> {
  return await callSupabaseAI<AskOutput>('ask', withOutputLanguage({
    message: boundAskMessage(message),
    history: boundAskHistory(history),
    mode,
    citationMode: Boolean(options.citationMode),
    webSearch: Boolean(options.webSearch),
    prosConsMode: Boolean(options.prosConsMode),
    argumentMapMode: Boolean(options.argumentMapMode),
  }), config, {
    workspaceContext: options.workspaceContext,
    debateId: options.debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown };
      const parsed = AskOutputSchema.safeParse(data.output);
      if (!parsed.success) {
        throw new AIResponseError('AI response did not match the expected ask schema.', {
          details: { issues: parsed.error.issues },
        });
      }
      return parsed.data;
    },
  });
}
