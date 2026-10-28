// Live generation: read the `ai` function's event stream (see
// supabase/functions/ai/stream.ts) and report the model's text as it is
// written. Shared by the website (src/lib/ai/live.ts) and the iOS app, which
// map the outcome to their own errors.

import { parsePartialJson } from './partial-json';
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

/**
 * The function sends a keepalive every 15 s. Three missed in a row means the
 * stream is gone even if the connection still looks open, as when a proxy
 * holds the tail of a response.
 */
export const LIVE_STREAM_STALL_MS = 45_000;

/**
 * A stalled stream is left open, not cancelled: closing it would make the
 * function cancel the run whose stored result the caller is about to read.
 * It is cancelled after this long, past any run's wall clock, or when the
 * caller aborts.
 */
export const LIVE_STREAM_STALLED_OPEN_MS = 160_000;

/**
 * Why a live stream ended without its answer: the body ended, the
 * connection dropped, nothing arrived for LIVE_STREAM_STALL_MS, or the
 * `result` event arrived but could not be read. The caller can still recover
 * the stored result (run-recovery.ts) before it reports the failure.
 */
export type LiveStreamFailure = 'ended' | 'dropped' | 'stalled' | 'unreadable';

export class LiveStreamError extends Error {
  readonly reason: LiveStreamFailure;
  /** The read error behind a dropped stream. */
  readonly cause?: unknown;

  constructor(reason: LiveStreamFailure, cause?: unknown) {
    super(reason === 'unreadable' ? 'The answer arrived but could not be read.' : 'The response ended before the answer was complete.');
    this.name = 'LiveStreamError';
    this.reason = reason;
    this.cause = cause;
  }
}

/** The part of a fetch body reader this module uses, in browsers and in Expo's fetch. */
export interface LiveStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
}

/** The part of an AbortSignal this module uses. */
interface LiveAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/**
 * How a live stream ended: the `result` event's status and body, or why no
 * result arrived. A 2xx result is the answer; any other status is the error
 * a plain request would have answered with.
 */
export type LiveOutcome =
  | { kind: 'result'; status: number; body: unknown }
  | { kind: 'failed'; error: LiveStreamError };

function abortError(): Error {
  const error = new Error('The request was canceled.');
  error.name = 'AbortError';
  return error;
}

/** Reads one chunk, or 'stalled' when nothing arrives in time. */
async function readWithin(reader: LiveStreamReader, ms: number): Promise<{ done: boolean; value?: Uint8Array } | 'stalled'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<'stalled'>((resolve) => {
        timer = setTimeout(() => resolve('stalled'), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isPhase(value: unknown): value is LivePhase {
  return value === 'research' || value === 'writing' || value === 'checking';
}

/**
 * Reads until the body ends, the caller aborts, the read fails, or `capMs`
 * elapses. True means the body ended, so the caller must not cancel it.
 */
async function drainUntilEnd(reader: LiveStreamReader, signal: LiveAbortSignal | undefined, capMs: number): Promise<boolean> {
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
      const winner = await Promise.race([read, cap.then((): { kind: 'cap' } => ({ kind: 'cap' }))]);
      if (winner.kind !== 'chunk') return false;
      if (winner.chunk.done) return true;
    }
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Follows an event stream from the `ai` function to its `result`. The
 * outcome is returned as soon as `result` arrives. Reading continues until
 * the body ends so the fetch is not cancelled in the gap before the server
 * closes it. Throws an AbortError when `signal` aborts.
 */
export async function readLiveStream(reader: LiveStreamReader, live: LiveGeneration, signal?: LiveAbortSignal): Promise<LiveOutcome> {
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let shown = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let result: { status: number; body: unknown } | null = null;
  let unreadableResult = false;

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
      const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
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
      } else if (event === 'result') {
        // A result that is not the {status, body} the function sends was
        // damaged on the way; the stored copy may still be read.
        if (typeof payload.status === 'number') result = { status: payload.status, body: payload.body };
        else unreadableResult = true;
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
  let stalled = false;
  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stalled) {
      // Keep the connection, so the run keeps going and stores its result.
      setTimeout(stopReading, LIVE_STREAM_STALLED_OPEN_MS);
      return;
    }
    signal?.removeEventListener('abort', stopReading);
    if (!streamEnded) reader.cancel().catch((): undefined => undefined);
  };

  let failure: LiveStreamError | null = null;
  try {
    while (!result && !failure) {
      if (signal?.aborted) throw abortError();
      let chunk: Awaited<ReturnType<typeof readWithin>>;
      try {
        chunk = await readWithin(reader, LIVE_STREAM_STALL_MS);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        // The connection dropped (ERR_CONNECTION_CLOSED, network change).
        failure = new LiveStreamError('dropped', error);
        break;
      }
      if (signal?.aborted) throw abortError();
      if (chunk === 'stalled') {
        stalled = true;
        failure = new LiveStreamError('stalled');
        break;
      }
      if (chunk.done) {
        streamEnded = true;
        break;
      }
      const parsed = consumeSSEChunk(buffer, decoder.decode(chunk.value, { stream: true }));
      buffer = parsed.buffer;
      handle(parsed.events);
    }
    // A last event without its closing blank line still counts.
    if (!result && !failure) handle(consumeSSEChunk('', `${buffer}${decoder.decode()}\n\n`).events);

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
  if (!final) return { kind: 'failed', error: failure ?? new LiveStreamError(unreadableResult ? 'unreadable' : 'ended') };
  return { kind: 'result', status: final.status, body: final.body };
}
