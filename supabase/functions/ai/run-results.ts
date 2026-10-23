// Keeps a streamed run's final answer in public.ai_run_results
// (20261023140000_ai_run_results.sql) so a browser whose stream dropped can
// read it (src/lib/ai/run-recovery.ts). Writes never fail the run: a missing
// table (function deployed before the migration) or a slow database only
// costs the recovery, never the answer.

const RESULT_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
// Either write is a single-row upsert or update; past this the answer is sent
// without waiting, as it was before the table existed.
const WRITE_TIMEOUT_MS = 4_000;
// The finish waits this long for a slow start write to land, so the start
// cannot arrive after the finish and leave a finished run looking unfinished.
const BEGIN_SETTLE_MS = 10_000;

/** The browser's id for a run, as the table accepts it, or null. */
export function parseResultKey(value: unknown): string | null {
  return typeof value === "string" && RESULT_KEY.test(value) ? value : null;
}

export interface RunResultRecorder {
  /** Marks the run as started; a row still unfinished later is a run the worker lost. */
  begin: () => Promise<void>;
  /** Stores what the `result` event carries, before it is sent. */
  finish: (result: Record<string, unknown>) => Promise<void>;
}

type WriteResult = PromiseLike<{ error: { message?: string; code?: string } | null }>;

interface RunResultsTable {
  upsert: (row: Record<string, unknown>, options: { onConflict: string }) => WriteResult;
  update: (row: Record<string, unknown>) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => { eq: (column: string, value: string) => WriteResult };
    };
  };
}

export interface RunResultsDatabase {
  from: (table: "ai_run_results") => RunResultsTable;
}

async function bounded(label: string, write: () => WriteResult, timeoutMs = WRITE_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      Promise.resolve(write()),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
    if (outcome === "timeout") console.warn(`[AI_RUN_RESULT] ${label} timed out`);
    else if (outcome.error) console.warn(`[AI_RUN_RESULT] ${label} failed:`, outcome.error.code ?? outcome.error.message?.slice(0, 200));
  } catch (error) {
    console.warn(`[AI_RUN_RESULT] ${label} failed:`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createRunResultRecorder(
  database: RunResultsDatabase,
  userId: string,
  feature: string,
  resultKey: string,
): RunResultRecorder {
  // The start write itself, which may outlive the begin() wait.
  let started: Promise<unknown> = Promise.resolve();
  return {
    begin: () => bounded("begin", () => {
      const write = Promise.resolve(database.from("ai_run_results").upsert({
        user_id: userId,
        feature,
        result_key: resultKey,
        status: null,
        body: null,
        started_at: new Date().toISOString(),
        finished_at: null,
      }, { onConflict: "user_id,feature" }));
      started = write.catch(() => undefined);
      return write;
    }),
    finish: async (result) => {
      await bounded("begin settle", () => started.then(() => ({ error: null })), BEGIN_SETTLE_MS);
      await bounded("finish", () => database.from("ai_run_results")
        .update({
          status: typeof result.status === "number" ? result.status : 500,
          body: result.body ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("feature", feature)
        // A newer run of the same feature took the row: leave its row alone.
        .eq("result_key", resultKey));
    },
  };
}
