import type { LiveGeneration } from '@debatelab/core/ai/live';
import { AskOutputSchema, type AskOutput } from '@debatelab/core/ai/schemas/ask';
import { consumeSSEChunk, type ParsedSSEEvent } from '@debatelab/core/ai/sse';
import type { DebateContextRequest } from '@debatelab/core/contract/debate-context';

import { abortError, AIError, errorFrom, postAI, postFunction, PROVIDER, responseExtras, utf8Length, type ResponseExtras } from './ai-request';
import type { FeatureConfig } from './feature-config';

/**
 * Ask requests, sent the way the website sends them (src/lib/ai/streaming.ts
 * and askChat in src/lib/ai/client.ts). Plain questions stream from the
 * ai-stream Edge Function. ai-stream refuses Citations, Web search, Pros/Cons
 * and Argument map, so with any of them on the answer comes whole from the ai
 * function, as on the website.
 */

const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_CONTENT_BYTES = 6_000;
const MAX_HISTORY_TOTAL_BYTES = 48_000;
const MAX_MESSAGE_BYTES = 80_000;

export interface AskOptions {
  citationMode: boolean;
  webSearch: boolean;
  prosConsMode: boolean;
  argumentMapMode: boolean;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The website's two Ask modes: a general answer, or one that defines terms and asks back. */
export type AskMode = 'general' | 'clarify';

export interface AskRequest {
  message: string;
  mode: AskMode;
  history: HistoryMessage[];
  options: AskOptions;
  config: FeatureConfig;
  language: string;
  /** Absent for one-off work. */
  debateContext?: DebateContextRequest;
}

/** The answer kinds that fail the same way however they are asked, so retrying without streaming cannot help. */
export function isFinalAskError(error: unknown): boolean {
  return error instanceof AIError && error.kind !== 'failed' && error.kind !== 'network';
}

/** Streaming serves plain questions in General mode only, as on the website (isAskStreamingSupported). */
export function canStream(options: AskOptions, mode: AskMode): boolean {
  return mode === 'general' && !(options.citationMode || options.webSearch || options.prosConsMode || options.argumentMapMode);
}

/** Cuts at a whole character, like the website's truncateUtf8. */
function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const char of value) {
    const size = utf8Length(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return value.slice(0, end);
}

export function isMessageWithinBudget(message: string): boolean {
  return utf8Length(message) <= MAX_MESSAGE_BYTES;
}

/** The last eight messages within the byte budget, as the website's boundAskHistory. */
export function boundHistory(history: HistoryMessage[]): HistoryMessage[] {
  let remaining = MAX_HISTORY_TOTAL_BYTES;
  return history.slice(-MAX_HISTORY_ITEMS).reverse().flatMap((message) => {
    if (remaining <= 0) return [];
    const content = truncateUtf8(message.content, Math.min(MAX_HISTORY_CONTENT_BYTES, remaining));
    remaining -= utf8Length(content);
    return content ? [{ ...message, content }] : [];
  }).reverse();
}

function requestInput(request: AskRequest) {
  if (!isMessageWithinBudget(request.message)) throw new AIError('tooLarge', 'Message is too large');
  return {
    message: request.message,
    history: boundHistory(request.history),
    mode: request.mode,
    citationMode: request.options.citationMode,
    webSearch: request.options.webSearch,
    prosConsMode: request.options.prosConsMode,
    argumentMapMode: request.options.argumentMapMode,
    language: request.language,
  };
}

/** The stream's final event names the model that answered; the website records it on the output. */
function parseOutput(output: unknown, resolvedModel?: string): AskOutput {
  const enriched = resolvedModel && output && typeof output === 'object' && !Array.isArray(output)
    ? { ...output, model: resolvedModel, provider: PROVIDER }
    : output;
  const parsed = AskOutputSchema.safeParse(enriched);
  if (!parsed.success) throw new AIError('failed', 'The answer did not match the expected shape');
  return parsed.data;
}

/** Streams an answer from ai-stream, calling onDelta with each piece of text. */
export function streamAsk(request: AskRequest, handlers: { onDelta: (text: string) => void; signal?: AbortSignal }): Promise<AskOutput> {
  const body = {
    feature: 'ask',
    input: requestInput(request),
    ...(request.debateContext ? { debateContext: request.debateContext } : {}),
    provider: PROVIDER,
    model: request.config.model,
    reasoningEffort: request.config.reasoningEffort,
  };
  return postFunction('ai-stream', body, handlers.signal, async (response) => {
    if (!response.body) throw new AIError('failed', 'The answer did not stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let resolvedModel = request.config.model;
    let output: AskOutput | null = null;

    const consume = (events: ParsedSSEEvent[]) => {
      for (const event of events) {
        const data = event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>) : null;
        if (event.event === 'delta' && data && 'text' in data) {
          const text = String(data.text ?? '');
          if (text) handlers.onDelta(text);
        }
        if (event.event === 'final' && data && 'output' in data && !output) {
          const meta = data.meta && typeof data.meta === 'object' ? (data.meta as Record<string, unknown>) : undefined;
          if (typeof meta?.resolvedModel === 'string') resolvedModel = meta.resolvedModel;
          output = parseOutput(data.output, resolvedModel);
        }
        if (event.event === 'error') {
          throw errorFrom(typeof data?.status === 'number' ? data.status : undefined, data, 'Streaming request failed');
        }
      }
    };

    const cancel = () => void reader.cancel().catch((): undefined => undefined);
    handlers.signal?.addEventListener('abort', cancel);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (handlers.signal?.aborted) throw abortError();
        if (done) break;
        const parsed = consumeSSEChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.buffer;
        consume(parsed.events);
      }
      consume(consumeSSEChunk('', `${buffer}\n\n`).events);
      if (!output) throw new AIError('failed', 'Streaming request ended before a final response was received');
      return output;
    } finally {
      handlers.signal?.removeEventListener('abort', cancel);
      cancel();
    }
  });
}

/**
 * Asks the ai Edge Function for a whole answer, with the options and modes
 * the stream cannot serve. With `onText`, the ai function streams it live, as
 * the website's Ask does, and onText receives the answer's text so far.
 * onExtras receives what the answer says besides its output, which the
 * website acts on for whole answers only.
 */
export function askOnce(
  request: AskRequest,
  signal?: AbortSignal,
  onExtras?: (extras: ResponseExtras) => void,
  onText?: (text: string) => void,
): Promise<AskOutput> {
  const body = {
    feature: 'ask',
    input: requestInput(request),
    provider: PROVIDER,
    model: request.config.model,
    reasoningEffort: request.config.reasoningEffort,
    // Servers from before Current Debate context read only this field.
    sourceIds: request.debateContext?.sourceIds ?? [],
    ...(request.debateContext ? { debateContext: request.debateContext } : {}),
  };
  const live: LiveGeneration | undefined = onText
    ? { onDraft: (draft) => onText(typeof draft.response === 'string' ? draft.response : '') }
    : undefined;
  return postAI(body, { signal, live }, ({ output, data }) => {
    const result = parseOutput(output);
    onExtras?.(responseExtras(data));
    return result;
  });
}
