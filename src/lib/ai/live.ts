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

function isPhase(value: unknown): value is LivePhase {
  return value === 'research' || value === 'writing' || value === 'checking';
}

/**
 * Reads a successful `ai` response. A JSON body (a server from before live
 * generation, or a cached reply) is returned as is; an event stream is
 * followed to its `result`, whose status decides success or failure.
 */
export async function readLiveResponse<T>(
  response: Response,
  live: LiveGeneration,
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
        live.onPhase?.(payload.phase);
      } else if (event === 'result' && typeof payload.status === 'number') {
        result = { status: payload.status, body: payload.body };
      }
    }
  };

  try {
    while (!result) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = consumeSSEChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      handle(parsed.events);
    }
    if (!result) handle(consumeSSEChunk('', `${buffer}${decoder.decode()}\n\n`).events);
  } finally {
    if (timer) clearTimeout(timer);
    reader.cancel().catch((): undefined => undefined);
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
