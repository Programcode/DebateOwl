// Live generation: read the `ai` function's event stream (see
// supabase/functions/ai/stream.ts) and report the model's text as it is
// written. The reader is shared with the iOS app
// (packages/core/src/ai/live.ts); here the finished request resolves exactly
// as a plain one does.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { readLiveStream, type LiveGeneration } from '@debatelab/core/ai/live';

export {
  LIVE_STREAM_DRAIN_MS,
  LIVE_STREAM_STALL_MS,
  LIVE_STREAM_STALLED_OPEN_MS,
  LiveStreamError,
  type LiveGeneration,
  type LivePhase,
  type LiveStreamFailure,
} from '@debatelab/core/ai/live';

/**
 * Reads a successful `ai` response. A JSON body (a server from before live
 * generation, or a cached reply) is returned as is; an event stream is
 * followed to its `result`, whose status decides success or failure.
 */
export async function readLiveResponse<T>(
  response: Response,
  live: LiveGeneration,
  signal?: AbortSignal,
): Promise<T | FunctionsHttpError | FunctionsFetchError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) return await response.json() as T;

  const outcome = await readLiveStream(response.body.getReader(), live, signal);
  if (outcome.kind === 'failed') return new FunctionsFetchError(outcome.error);
  if (outcome.status >= 200 && outcome.status < 300) return outcome.body as T;
  // The same error a plain request would have produced, so error mapping
  // (limits, model access, provider failures) does not change.
  return new FunctionsHttpError(new Response(JSON.stringify(outcome.body ?? {}), {
    status: outcome.status,
    headers: { 'Content-Type': 'application/json' },
  }));
}
