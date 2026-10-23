// Live generation for the ai Edge Function. A request that sends
// `stream: true` gets Server-Sent Events instead of one JSON body:
//
//   event: phase   data: {"phase":"research"|"writing"|"checking"}
//   event: delta   data: {"text":"..."}   raw model text, token by token
//   event: reset   data: {}               a repair retry voids the text so far
//   event: result  data: {"status":200,"body":{...}}
//
// `result` comes last, exactly once, and carries the status and JSON body the
// non-streamed request would have answered with. Every check that runs before
// the feature handler still answers with plain JSON and its real status.
//
// The worker is kept alive (EdgeRuntime.waitUntil) from the first event until
// the HTTP layer has taken the last byte. Supabase otherwise counts a stream
// as answered once its headers are out and may retire the worker mid-run.
// With a recorder, `result` is stored before it is sent, so a browser that
// loses the stream can still read it.

import { keepWorkerAlive } from "../_shared/background.ts";
import type { GenerationPhase, GenerationStream } from "./provider.ts";
import type { RunResultRecorder } from "./run-results.ts";

const HEARTBEAT_MS = 15_000;
// After `result`, hold the worker at most this long for the browser to take
// the last bytes. A client that stopped reading must not hold it to 150 s.
const DRAIN_CAP_MS = 10_000;
// Bytes the HTTP layer took on the last read still have to reach the socket.
const SETTLE_MS = 500;

const FAILED_RESULT = { status: 500, body: { error: "AI request failed. Please try again.", code: "provider_error" } };
// Running out of time is worth another try; the browser says so.
const DEADLINE_RESULT = { status: 500, body: { ...FAILED_RESULT.body, retryable: true } };

function sse(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function resultPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${response.status})` };
  }
  return { status: response.status, body };
}

/** Resolves with `fallback` after `ms`, or with `work`, whichever is first; the timer never outlives it. */
async function within<T, F>(work: Promise<T>, ms: number | undefined, fallback: F): Promise<T | F> {
  if (ms === undefined) return await work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<F>((resolve) => {
      timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface StreamFeatureOptions {
  /** Stores the final result before it is sent; the browser sent a result key. */
  recorder?: RunResultRecorder;
  /**
   * Milliseconds from now after which the stream stops waiting for the run,
   * aborts it, and sends a timeout result, so a run that outlives its budget
   * ends with an answer instead of a dropped connection at the wall clock.
   */
  deadlineMs?: number;
}

/**
 * Runs a feature with a stream sink and returns its events as the response.
 * `cancel` aborts when the browser goes away so provider work stops with it.
 */
export function streamFeatureResponse(
  corsHeaders: Record<string, string>,
  cancel: AbortController,
  run: (stream: GenerationStream) => Promise<Response>,
  options: StreamFeatureOptions = {},
): Response {
  const encoder = new TextEncoder();
  // Events wait here until the HTTP layer reads them. The body below hands
  // out one chunk per read, so when it closes the last event has been taken.
  const queue: Uint8Array[] = [];
  let ended = false;
  let gone = false;
  let wake: (() => void) | undefined;
  let markDrained!: () => void;
  const drained = new Promise<void>((resolve) => {
    markDrained = resolve;
  });
  const push = (chunk: string) => {
    if (ended || gone) return;
    queue.push(encoder.encode(chunk));
    wake?.();
  };
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise<void>((resolve) => {
        const deliver = () => {
          wake = undefined;
          const chunk = queue.shift();
          if (chunk) controller.enqueue(chunk);
          else if (ended) {
            controller.close();
            markDrained();
          } else {
            wake = deliver;
            return;
          }
          resolve();
        };
        deliver();
      });
    },
    cancel() {
      gone = true;
      queue.length = 0;
      wake = undefined;
      stop();
      markDrained();
      cancel.abort();
    },
  }, { highWaterMark: 0 });

  let lastPhase: GenerationPhase | undefined;
  const stream: GenerationStream = {
    delta: (text) => push(sse("delta", { text })),
    reset: () => push(sse("reset", {})),
    phase: (phase) => {
      if (phase === lastPhase) return;
      lastPhase = phase;
      push(sse("phase", { phase }));
    },
  };

  const lifecycle = (async () => {
    // Research can run for a minute without output; keep proxies from
    // treating the connection as idle.
    heartbeat = setInterval(() => push(": keepalive\n\n"), HEARTBEAT_MS);
    const began = options.recorder?.begin() ?? Promise.resolve();
    const running = keepWorkerAlive(run(stream).then(resultPayload));
    let payload: Record<string, unknown>;
    try {
      const outcome = await within(running, options.deadlineMs, "deadline" as const);
      if (outcome === "deadline") {
        console.error("[AI_STREAM] Run passed its deadline; answering with a timeout");
        // The run's own error path refunds and logs it once it sees the abort.
        cancel.abort(new DOMException("The request ran past its time budget", "TimeoutError"));
        running.catch(() => undefined);
        payload = DEADLINE_RESULT;
      } else {
        payload = outcome;
      }
    } catch (error) {
      console.error("[AI_STREAM] Stream failed:", error instanceof Error ? error.message.slice(0, 2000) : "Unknown error");
      payload = FAILED_RESULT;
    }
    if (options.recorder) {
      await began;
      // Stored before it is sent: a browser that loses the stream from here
      // on can still read it.
      await options.recorder.finish(payload);
    }
    push(sse("result", payload));
    stop();
    ended = true;
    wake?.();
    await within(drained, DRAIN_CAP_MS, undefined);
  })();
  keepWorkerAlive(lifecycle, SETTLE_MS);

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
