// Recovers a live run's answer after its stream dropped. The ai function
// keeps each streamed run's final result in ai_run_results under the id the
// client sent (supabase/functions/ai/run-results.ts), writing it before it
// sends the `result` event, so an answer the client did not receive can
// still be read. Shared by the website and the iOS app; each passes its own
// read of the table.

import { abortError } from './abort';

export interface RecoveredRunResult {
  status: number;
  body: unknown;
}

/** The caller's read of the signed-in user's ai_run_results row for one feature. */
export type ReadRunResult = (feature: string) => PromiseLike<{
  data: unknown;
  error: unknown;
}>;

/** No run answers past Supabase's 150 s wall clock, counted from the request. */
export const RUN_RESULT_WAIT_MS = 155_000;
export const RUN_RESULT_POLL_MS = 2_500;
/**
 * A run the server started has a row within moments. With none after this
 * long, the request never reached a server that keeps results.
 */
export const RUN_RESULT_MISSING_MS = 8_000;
/**
 * A run that loses its client is cancelled and stores its outcome within
 * seconds, and one still running stores it when it ends. A row still without
 * a result this long after the drop is a run whose worker is gone. A stalled
 * stream is left open (live.ts), so its run is still writing and stores its
 * result when it ends; it waits the whole window instead.
 */
export const RUN_RESULT_RUNNING_MS = 30_000;

interface WaitSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

function wait(ms: number, signal?: WaitSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Waits for the stored result of the run named `resultKey`, which started at
 * `startedAt` (epoch ms). Resolves with it, or null when there is none to
 * wait for: no row (an older server, or a request that never arrived), a
 * newer run of the same feature took the row, the table cannot be read, or
 * the run outlived any server. Rejects only when `signal` aborts.
 */
export async function recoverRunResult(
  read: ReadRunResult,
  feature: string,
  resultKey: string,
  startedAt: number,
  signal?: WaitSignal,
  runningGraceMs = RUN_RESULT_RUNNING_MS,
  now: () => number = Date.now,
): Promise<RecoveredRunResult | null> {
  const recoveryStartedAt = now();
  while (true) {
    if (signal?.aborted) throw abortError();
    const { data, error } = await read(feature);
    if (signal?.aborted) throw abortError();
    if (error) return null;
    const row = data as { result_key?: unknown; status?: unknown; body?: unknown } | null;
    if (row && row.result_key !== resultKey) return null;
    if (row && typeof row.status === 'number') return { status: row.status, body: row.body };
    // No row yet, or a run still writing (status null).
    if (!row && now() - recoveryStartedAt >= RUN_RESULT_MISSING_MS) return null;
    if (row && now() - recoveryStartedAt >= runningGraceMs) return null;
    if (now() - startedAt >= RUN_RESULT_WAIT_MS) return null;
    await wait(RUN_RESULT_POLL_MS, signal);
  }
}
