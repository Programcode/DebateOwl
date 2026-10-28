// Recovers a live run's answer after its stream dropped. The waiting rules are
// shared with the iOS app (packages/core/src/ai/run-recovery.ts); this reads
// the browser's ai_run_results row.

import {
  recoverRunResult as recoverStoredRunResult,
  RUN_RESULT_RUNNING_MS,
  type RecoveredRunResult,
} from '@debatelab/core/ai/run-recovery';
import { supabase } from '@/lib/supabase/client';

export { RUN_RESULT_MISSING_MS, RUN_RESULT_POLL_MS, RUN_RESULT_RUNNING_MS, RUN_RESULT_WAIT_MS, type RecoveredRunResult } from '@debatelab/core/ai/run-recovery';

const readRunResult = (feature: string) =>
  supabase.from('ai_run_results').select('result_key,status,body').eq('feature', feature).maybeSingle();

export function recoverRunResult(
  feature: string,
  resultKey: string,
  startedAt: number,
  signal?: AbortSignal,
  runningGraceMs = RUN_RESULT_RUNNING_MS,
  now: () => number = Date.now,
): Promise<RecoveredRunResult | null> {
  return recoverStoredRunResult(readRunResult, feature, resultKey, startedAt, signal, runningGraceMs, now);
}
