// Live generation: read the `ai` function's event stream (see
// supabase/functions/ai/stream.ts) and report the model's text as it is
// written. The finished request resolves exactly as a plain one does.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { parsePartialJson } from '@debatelab/core/ai/partial-json';
import { consumeSSEChunk, type ParsedSSEEvent } from './sse';

export type LivePhase = 'research' | 'writing' | 'checking';

export interface LiveGeneration {
  /** The answer's JSON as far as the model has written it. Throttled. */
  onDraft: (draft: Record<string, unknown>) => void;
  /** A step that writes nothing yet started, such as web research. */
  onPhase?: (phase: LivePhase) => void;
}

const DRAFT_INTERVAL_MS = 50;

/**
 * After `result`, keep reading only this long. The function closes the body
 * a moment later; waiting for that close avoids cancelling the fetch, and
 * the cap stops a body that never closes from holding the reader open.
 */
export const LIVE_STREAM_DRAIN_MS = 2_000;

function isPhase(value: unknown): value is LivePhase {
  return value === 'research' || value === 'writing' || value === 'checking';
}

/**
 * Reads until the body ends, the caller aborts, the read fails, or `capMs`
 * elapses. True means the body ended, so the caller must not cancel it.
 */
async function drainUntilEnd(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  capMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<'cap'>((resolve) => {
    timer = setTimeout(() => resolve('cap'), capMs);
  });
  try {
    while (!signal?.aborted) {
      const read = reader.read().then(
        (chunk) => ({ kind: 'chunk' as const, chunk }),
        (): { kind: 'error' } => ({ kind: 'error' }),
      );
      const winner = await Promise.race([
        read,
        cap.then((): { kind: 'cap' } => ({ kind: 'cap' })),
      ]);
      if (winner.kind !== 'chunk') return false;
      if (winner.chunk.done) return true;
    }
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Reads a successful `ai` response. A JSON body (a server from before live
 * generation, or a cached reply) is returned as is; an event stream is
 * followed to its `result`, whose status decides success or failure.
 * The answer is returned as soon as `result` arrives. Reading continues
 * until the body ends so the fetch is not cancelled in the gap before the
 * server closes it.
 */
export async function readLiveResponse<T>(
  response: Response,
  live: LiveGeneration,
  signal?: AbortSignal,
): Promise<T | FunctionsHttpError | FunctionsFetchError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) return await response.json() as T;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let shown = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let result: { status: number; body: unknown } | null = null;

  const showDraft = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (text === shown) return;
    shown = text;
    const draft = parsePartialJson(text);
    if (draft) live.onDraft(draft);
  };
  const scheduleDraft = () => {
    if (!timer) timer = setTimeout(showDraft, DRAFT_INTERVAL_MS);
  };

  const handle = (events: ParsedSSEEvent[]) => {
    for (const { event, data } of events) {
      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      if (event === 'delta' && typeof payload.text === 'string') {
        text += payload.text;
        scheduleDraft();
      } else if (event === 'reset') {
        // A repair retry writes the answer again from the start.
        text = '';
        shown = '';
        live.onDraft({});
      } else if (event === 'phase' && isPhase(payload.phase)) {
        // Text written before this phase lands first, so a throttled draft
        // cannot arrive after it and look like writing again.
        showDraft();
        live.onPhase?.(payload.phase);
      } else if (event === 'result' && typeof payload.status === 'number') {
        result = { status: payload.status, body: payload.body };
      }
    }
  };

  // A fetch wrapper (the Jam recorder wraps window.fetch) can keep a
  // response streaming after its request is aborted, so stop reading here.
  const stopReading = () => {
    reader.cancel(signal?.reason).catch((): undefined => undefined);
  };
  signal?.addEventListener('abort', stopReading, { once: true });

  // Cancel only while the body is still open. Cancelling after `result`,
  // before the server closes, aborts the fetch and drops the body.
  let streamEnded = false;
  let draining = false;
  const release = () => {
    signal?.removeEventListener('abort', stopReading);
    if (timer) clearTimeout(timer);
    timer = null;
    if (!streamEnded) reader.cancel().catch((): undefined => undefined);
  };

  try {
    while (!result) {
      if (signal?.aborted) throw new DOMException('The request was canceled.', 'AbortError');
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException('The request was canceled.', 'AbortError');
      if (done) {
        streamEnded = true;
        break;
      }
      const parsed = consumeSSEChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      handle(parsed.events);
    }
    if (!result) handle(consumeSSEChunk('', `${buffer}${decoder.decode()}\n\n`).events);

    // Hand the answer back before the tail, so a slow close cannot delay the UI.
    if (result && !streamEnded) {
      if (timer) clearTimeout(timer);
      timer = null;
      draining = true;
      void drainUntilEnd(reader, signal, LIVE_STREAM_DRAIN_MS)
        .then((ended) => {
          streamEnded = ended;
        })
        .catch((): undefined => undefined)
        .finally(release);
    }
  } finally {
    if (!draining) release();
  }

  const final = result as { status: number; body: unknown } | null;
  if (!final) return new FunctionsFetchError(new Error('The response ended before the answer was complete.'));
  if (final.status >= 200 && final.status < 300) return final.body as T;
  // The same error a plain request would have produced, so error mapping
  // (limits, model access, provider failures) does not change.
  return new FunctionsHttpError(new Response(JSON.stringify(final.body ?? {}), {
    status: final.status,
    headers: { 'Content-Type': 'application/json' },
  }));
}
