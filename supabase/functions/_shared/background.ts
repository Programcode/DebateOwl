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
