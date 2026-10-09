import { AskOutputSchema, type AskOutput } from '@debatelab/core/ai/schemas/ask';
import { consumeSSEChunk, type ParsedSSEEvent } from '@debatelab/core/ai/sse';
import type { DebateContextRequest } from '@debatelab/core/contract/debate-context';
import { fetch } from 'expo/fetch';

import type { AskConfig } from './ask-config';
import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

/**
 * Ask requests, sent the way the website sends them (src/lib/ai/streaming.ts
 * and askChat in src/lib/ai/client.ts). Plain questions stream from the
 * ai-stream Edge Function. ai-stream refuses Citations, Web search, Pros/Cons
 * and Argument map, so with any of them on the answer comes whole from the ai
 * function, as on the website.
 */

export const REQUEST_TIMEOUT_MS = 200 * 1000;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_CONTENT_BYTES = 6_000;
const MAX_HISTORY_TOTAL_BYTES = 48_000;
const MAX_MESSAGE_BYTES = 80_000;
const MAX_REQUEST_BODY_BYTES = 190_000;
const PROVIDER = 'openrouter';

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

export interface AskRequest {
  message: string;
  history: HistoryMessage[];
  options: AskOptions;
  config: AskConfig;
  language: string;
  /** Absent for one-off work. */
  debateContext?: DebateContextRequest;
}

export type AskErrorKind =
  | 'auth'
  | 'trialExpired'
  | 'limitReached'
  | 'modelRestricted'
  | 'rateLimit'
  | 'network'
  | 'timeout'
  | 'tooLarge'
  | 'debateMissing'
  | 'failed';

export class AskError extends Error {
  constructor(readonly kind: AskErrorKind, message: string) {
    super(message);
    this.name = 'AskError';
  }
}

/** The answer kinds that fail the same way however they are asked, so retrying without streaming cannot help. */
export function isFinalAskError(error: unknown): boolean {
  return error instanceof AskError && error.kind !== 'failed' && error.kind !== 'network';
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** Streaming serves plain questions only, as on the website (isAskStreamingSupported). */
export function canStream(options: AskOptions): boolean {
  return !(options.citationMode || options.webSearch || options.prosConsMode || options.argumentMapMode);
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
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
  if (!isMessageWithinBudget(request.message)) throw new AskError('tooLarge', 'Message is too large');
  return {
    message: request.message,
    history: boundHistory(request.history),
    mode: 'general',
    citationMode: request.options.citationMode,
    webSearch: request.options.webSearch,
    prosConsMode: request.options.prosConsMode,
    argumentMapMode: request.options.argumentMapMode,
    language: request.language,
  };
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AskError('auth', 'Please sign in to use AI features');
  return token;
}

function errorFrom(status: number | undefined, payload: Record<string, unknown> | null, fallback: string): AskError {
  const message = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : fallback;
  const code = typeof payload?.code === 'string' ? payload.code : undefined;
  if (status === 401) return new AskError('auth', message);
  if (code === 'upgrade_required') return new AskError('modelRestricted', message);
  if (status === 402 || code === 'trial_expired' || code === 'limit_reached') {
    return new AskError(code === 'trial_expired' ? 'trialExpired' : 'limitReached', message);
  }
  if (status === 403) return /model|upgrade/i.test(message) ? new AskError('modelRestricted', message) : new AskError('auth', message);
  if (status === 404) return new AskError('debateMissing', message);
  if (status === 429 || /rate limit|limit exceeded/i.test(message)) return new AskError('rateLimit', message);
  return new AskError('failed', message);
}

async function payloadOf(response: { json: () => Promise<unknown> }): Promise<Record<string, unknown> | null> {
  const payload: unknown = await response.json().catch((): null => null);
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

/** The stream's final event names the model that answered; the website records it on the output. */
function parseOutput(output: unknown, resolvedModel?: string): AskOutput {
  const enriched = resolvedModel && output && typeof output === 'object' && !Array.isArray(output)
    ? { ...output, model: resolvedModel, provider: PROVIDER }
    : output;
  const parsed = AskOutputSchema.safeParse(enriched);
  if (!parsed.success) throw new AskError('failed', 'The answer did not match the expected shape');
  return parsed.data;
}

/** One POST with the website's headers, a 200 s timeout and the caller's abort. */
async function post(path: string, body: Record<string, unknown>, signal: AbortSignal | undefined, run: (response: Awaited<ReturnType<typeof fetch>>) => Promise<AskOutput>): Promise<AskOutput> {
  if (signal?.aborted) throw abortError();
  const token = await accessToken();
  const json = JSON.stringify(body);
  if (utf8Length(json) > MAX_REQUEST_BODY_BYTES) throw new AskError('tooLarge', 'Request is too large');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortForCaller = () => controller.abort();
  signal?.addEventListener('abort', abortForCaller);
  try {
    const response = await fetch(`${supabaseProject.url}/functions/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseProject.anonKey, 'Content-Type': 'application/json' },
      body: json,
      signal: controller.signal,
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) throw cause;
      throw new AskError('network', cause instanceof Error ? cause.message : 'Network request failed');
    });
    if (!response.ok) throw errorFrom(response.status, await payloadOf(response), `Request failed (${response.status})`);
    return await run(response);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (controller.signal.aborted) throw new AskError('timeout', 'The request took too long');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortForCaller);
  }
}

/** Streams an answer from ai-stream, calling onDelta with each piece of text. */
export function streamAsk(request: AskRequest, handlers: { onDelta: (text: string) => void; signal?: AbortSignal }): Promise<AskOutput> {
  const body = {
    feature: 'ask',
    input: requestInput(request),
    ...(request.debateContext ? { debateContext: request.debateContext } : {}),
    provider: PROVIDER,
    model: request.config.model,
    temperature: request.config.temperature,
    reasoningEffort: request.config.reasoningEffort,
  };
  return post('ai-stream', body, handlers.signal, async (response) => {
    if (!response.body) throw new AskError('failed', 'The answer did not stream');
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
      if (!output) throw new AskError('failed', 'Streaming request ended before a final response was received');
      return output;
    } finally {
      handlers.signal?.removeEventListener('abort', cancel);
      cancel();
    }
  });
}

/** Asks the ai Edge Function for a whole answer, with the options the stream cannot serve. */
export function askOnce(request: AskRequest, signal?: AbortSignal): Promise<AskOutput> {
  const body = {
    feature: 'ask',
    input: requestInput(request),
    provider: PROVIDER,
    model: request.config.model,
    temperature: request.config.temperature,
    reasoningEffort: request.config.reasoningEffort,
    // Servers from before Current Debate context read only this field.
    sourceIds: request.debateContext?.sourceIds ?? [],
    ...(request.debateContext ? { debateContext: request.debateContext } : {}),
  };
  return post('ai', body, signal, async (response) => {
    const data = await payloadOf(response);
    if (typeof data?.error === 'string') throw errorFrom(undefined, data, data.error);
    if (!data?.output) throw new AskError('failed', 'The answer was missing');
    return parseOutput(data.output);
  });
}
