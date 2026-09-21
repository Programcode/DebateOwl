import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { captureProductEvent } from '@/lib/observability';
import { AIAuthError, AIResponseError, REQUEST_TIMEOUT_MS, TimeoutError, mapAIError, reportAIFailure, withOutputLanguage } from './client';
import type { ProviderConfig } from './providers/types';
import { AskOutputSchema, type AskOutput } from './schemas/ask';

export interface AskStreamOptions {
  mode?: string;
  citationMode?: boolean;
  webSearch?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
}

export interface AskStreamHandlers {
  onDelta: (text: string) => void;
  onFinal?: (output: AskOutput) => void;
  signal?: AbortSignal;
}

export type ParsedSSEEvent = {
  event: string;
  data: unknown;
};

export function isAskStreamingSupported(config: ProviderConfig, options: AskStreamOptions = {}) {
  const advancedStructuredMode = Boolean(
    (options.mode ?? 'general') !== 'general' ||
    options.citationMode ||
    options.webSearch ||
    options.prosConsMode ||
    options.argumentMapMode
  );

  return !advancedStructuredMode && config.provider === 'openrouter';
}

function parseEventBlock(block: string): ParsedSSEEvent | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  const rawData = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
}

export function consumeSSEChunk(buffer: string, chunk: string): { events: ParsedSSEEvent[]; buffer: string } {
  const normalized = `${buffer}${chunk}`.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts
    .map(parseEventBlock)
    .filter((event): event is ParsedSSEEvent => event !== null);

  return { events, buffer: rest };
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function waitForCaller<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation);
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function captureStreamFailure(
  error: unknown,
  provider: string,
  model: string,
  startTime: number,
  requestId: string,
  callerAborted: boolean,
): void {
  reportAIFailure({
    error,
    feature: 'ask',
    streaming: true,
    provider,
    model,
    startTime,
    requestId,
    userInitiatedAbort: callerAborted,
  });
}

export async function streamAskChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig,
  options: AskStreamOptions,
  handlers: AskStreamHandlers
): Promise<AskOutput> {
  const provider = config.provider === 'mock' ? 'mock' : 'openrouter';
  const requestId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = performance.now();
  captureProductEvent('ai_request_started', {
    feature: 'ask',
    streaming: true,
    provider,
    model: config.model,
  });

  if (handlers.signal?.aborted) {
    const error = abortError();
    captureStreamFailure(error, provider, config.model, startTime, requestId, true);
    throw error;
  }

  let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'];
  try {
    ({ data: sessionData } = await waitForCaller(supabase.auth.getSession(), handlers.signal));
  } catch (error) {
    captureStreamFailure(error, provider, config.model, startTime, requestId, Boolean(handlers.signal?.aborted));
    throw error;
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    const error = new AIAuthError('Please sign in to use AI features', { requestId });
    captureStreamFailure(error, provider, config.model, startTime, requestId, Boolean(handlers.signal?.aborted));
    throw error;
  }
  if (handlers.signal?.aborted) {
    const error = abortError();
    captureStreamFailure(error, provider, config.model, startTime, requestId, true);
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortForCaller = () => controller.abort();
  handlers.signal?.addEventListener('abort', abortForCaller);

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReader = (): void => {
    reader?.cancel().catch((): undefined => undefined);
  };
  controller.signal.addEventListener('abort', cancelReader);

  const parseFinalOutput = (output: unknown): AskOutput => {
    const parsed = AskOutputSchema.safeParse(output);
    if (!parsed.success) {
      throw new AIResponseError('Streaming response did not match the expected ask schema.', {
        requestId,
        details: { issues: parsed.error.issues },
      });
    }
    return parsed.data;
  };

  const acceptFinal = (output: unknown, current: AskOutput | null): AskOutput | null => {
    if (current) return current;
    const parsed = parseFinalOutput(output);
    handlers.onFinal?.(parsed);
    return parsed;
  };

  const mapStreamingError = (message: string, payload?: Record<string, unknown>, status?: number): ReturnType<typeof mapAIError> =>
    mapAIError({ message, context: { status } }, requestId, provider, config.model, payload);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feature: 'ask',
        input: withOutputLanguage({
          message,
          history,
          mode,
          citationMode: Boolean(options.citationMode),
          webSearch: Boolean(options.webSearch),
          prosConsMode: Boolean(options.prosConsMode),
          argumentMapMode: Boolean(options.argumentMapMode),
        }),
        provider,
        model: config.model,
        temperature: config.temperature,
        reasoningEffort: config.reasoningEffort ?? 'low',
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const payload = await response.clone().json().catch((): null => null);
      throw mapStreamingError(
        `Streaming request failed (${response.status})`,
        payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined,
        response.status,
      );
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalOutput: AskOutput | null = null;

    const consumeEvents = (events: ParsedSSEEvent[]): void => {
      for (const event of events) {
        if (event.event === 'delta' && typeof event.data === 'object' && event.data !== null && 'text' in event.data) {
          const text = String((event.data as { text?: unknown }).text ?? '');
          if (text) handlers.onDelta(text);
        }

        if (event.event === 'final' && typeof event.data === 'object' && event.data !== null && 'output' in event.data) {
          finalOutput = acceptFinal((event.data as { output: unknown }).output, finalOutput);
        }

        if (event.event === 'error') {
          const payload = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined;
          const message = typeof payload?.message === 'string' ? payload.message : 'Streaming request failed';
          const status = typeof payload?.status === 'number' ? payload.status : undefined;
          throw mapStreamingError(message, payload, status);
        }
      }
    };

    while (true) {
      if (handlers.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (handlers.signal?.aborted) throw abortError();
      if (done) break;

      const parsed = consumeSSEChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      consumeEvents(parsed.events);
    }

    const finalParsed = consumeSSEChunk('', `${buffer}\n\n`);
    consumeEvents(finalParsed.events);

    if (!finalOutput) {
      throw new AIResponseError('Streaming request ended before a final response was received', { requestId });
    }

    captureProductEvent('ai_request_succeeded', {
      feature: 'ask',
      streaming: true,
      provider,
      model: config.model,
      durationMs: Math.round(performance.now() - startTime),
    });

    return finalOutput;
  } catch (error) {
    const callerAborted = Boolean(handlers.signal?.aborted);
    const reportedError = callerAborted
      ? abortError()
      : controller.signal.aborted
        ? new TimeoutError()
        : error;
    captureStreamFailure(reportedError, provider, config.model, startTime, requestId, callerAborted);
    if (callerAborted) throw reportedError;
    if (controller.signal.aborted) throw reportedError;
    throw error;
  } finally {
    clearTimeout(timeoutId);
    handlers.signal?.removeEventListener('abort', abortForCaller);
    controller.signal.removeEventListener('abort', cancelReader);
    cancelReader();
  }
}
