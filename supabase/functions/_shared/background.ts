// Keeps an Edge Function worker alive while work it started is still running.
//
// Supabase counts a streamed Response as answered once its headers go out,
// and can then retire the worker ("EarlyDrop") with the stream still being
// written, unless the work is registered with EdgeRuntime.waitUntil. Every
// streamed run registers its whole lifecycle here: the run, the final event,
// the result row, and the close.

interface EdgeRuntimeLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

// Supabase stops a worker 150 s after its request arrived.
export const WORKER_WALL_CLOCK_MS = 150_000;
// Kept free at the end of it: the settle below, and slack for the runtime.
const WALL_CLOCK_MARGIN_MS = 2_000;

/** Milliseconds a worker whose request arrived at `receivedAt` may still hold on, never negative. */
export function workerTimeLeft(receivedAt: number, now = Date.now()): number {
  return Math.max(0, WORKER_WALL_CLOCK_MS - WALL_CLOCK_MARGIN_MS - (now - receivedAt));
}

/** Resolves when `work` settles or after `ms`, whichever is first; the timer never outlives it. */
export async function waitAtMost(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work.then(() => undefined, () => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Hands `source` to the HTTP layer one chunk per read. `drained` resolves once
 * the reader has taken the last chunk and asked for more, or went away. A
 * stream enqueued from `start` closes with its tail still queued; this tells
 * the worker when that tail has actually left.
 */
export function trackDrain(source: ReadableStream<Uint8Array>): { body: ReadableStream<Uint8Array>; drained: Promise<void> } {
  const reader = source.getReader();
  let markDrained!: () => void;
  const drained = new Promise<void>((resolve) => {
    markDrained = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          markDrained();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        markDrained();
      }
    },
    async cancel(reason) {
      markDrained();
      await reader.cancel(reason);
    },
  }, { highWaterMark: 0 });
  return { body, drained };
}

/**
 * Registers `work` with EdgeRuntime.waitUntil when the runtime provides it
 * (deployed and `supabase functions serve`); a no-op in tests and plain Deno.
 * Returns `work` unchanged. A rejection is still the caller's to handle; the
 * runtime only sees a settled promise. `settleMs` holds the worker that much
 * longer, for bytes the HTTP layer took but has not written yet.
 */
export function keepWorkerAlive<T>(work: Promise<T>, settleMs = 0): Promise<T> {
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    try {
      const settled = work.then(() => undefined, () => undefined);
      runtime.waitUntil(settleMs > 0 ? settled.then(() => new Promise((resolve) => setTimeout(resolve, settleMs))) : settled);
    } catch (error) {
      console.warn("[RUNTIME] waitUntil failed:", error instanceof Error ? error.message : "unknown");
    }
  }
  return work;
}
