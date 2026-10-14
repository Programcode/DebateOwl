import { parseSourceAssessments, type SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';
import { fetch } from 'expo/fetch';

import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

/**
 * One request to an AI Edge Function, sent the way the website's AI client
 * (src/lib/ai/client.ts) sends it: the same headers, the 200 s timeout, the
 * caller's abort, and its errors sorted into the kinds the screens explain.
 */

export const REQUEST_TIMEOUT_MS = 200 * 1000;
const MAX_REQUEST_BODY_BYTES = 190_000;
export const PROVIDER = 'openrouter';

export type AIErrorKind =
  | 'auth'
  | 'trialExpired'
  | 'limitReached'
  | 'modelRestricted'
  | 'rateLimit'
  | 'network'
  | 'timeout'
  | 'tooLarge'
  | 'debateMissing'
  | 'failed';

export class AIError extends Error {
  constructor(readonly kind: AIErrorKind, message: string) {
    super(message);
    this.name = 'AIError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** Settles with the read, or rejects as soon as the signal aborts. The read itself cannot be cancelled, only no longer waited for. */
export function untilAborted<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // Nobody waits for the read any more, so its own failure must not go unhandled.
    read.catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    read.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AIError('auth', 'Please sign in to use AI features');
  return token;
}

export function errorFrom(status: number | undefined, payload: Record<string, unknown> | null, fallback: string): AIError {
  const message = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : fallback;
  const code = typeof payload?.code === 'string' ? payload.code : undefined;
  if (status === 401) return new AIError('auth', message);
  if (code === 'upgrade_required') return new AIError('modelRestricted', message);
  if (status === 402 || code === 'trial_expired' || code === 'limit_reached') {
    return new AIError(code === 'trial_expired' ? 'trialExpired' : 'limitReached', message);
  }
  if (status === 403) return /model|upgrade/i.test(message) ? new AIError('modelRestricted', message) : new AIError('auth', message);
  if (status === 404) return new AIError('debateMissing', message);
  if (status === 429 || /rate limit|limit exceeded/i.test(message)) return new AIError('rateLimit', message);
  return new AIError('failed', message);
}

export async function payloadOf(response: { json: () => Promise<unknown> }): Promise<Record<string, unknown> | null> {
  const payload: unknown = await response.json().catch((): null => null);
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

export type FunctionResponse = Awaited<ReturnType<typeof fetch>>;

/** One POST with the website's headers, its timeout (200 s unless the feature sets its own) and the caller's abort. */
export async function postFunction<T>(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  run: (response: FunctionResponse) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  // The deadline and the caller's abort start before the session read, so
  // leaving the screen while the token refreshes never sends the request, and
  // a refresh that stalls ends at the deadline instead of when it resolves.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortForCaller = () => controller.abort();
  signal?.addEventListener('abort', abortForCaller);
  if (signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw abortError();
    const token = await untilAborted(accessToken(), controller.signal);
    const json = JSON.stringify(body);
    if (utf8Length(json) > MAX_REQUEST_BODY_BYTES) throw new AIError('tooLarge', 'Request is too large');
    const response = await fetch(`${supabaseProject.url}/functions/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseProject.anonKey, 'Content-Type': 'application/json' },
      body: json,
      signal: controller.signal,
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) throw cause;
      throw new AIError('network', cause instanceof Error ? cause.message : 'Network request failed');
    });
    if (!response.ok) throw errorFrom(response.status, await payloadOf(response), `Request failed (${response.status})`);
    return await run(response);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (controller.signal.aborted) throw new AIError('timeout', 'The request took too long');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortForCaller);
  }
}

/**
 * The `output` of a whole answer from the ai function. A 200 response can
 * still carry an error, as the website's callSupabaseAI handles.
 */
export async function functionOutput(response: FunctionResponse): Promise<{ output: unknown; data: Record<string, unknown> }> {
  const data = await payloadOf(response);
  if (typeof data?.error === 'string') throw errorFrom(undefined, data, data.error);
  if (!data?.output) throw new AIError('failed', 'The answer was missing');
  return { output: data.output, data };
}

/** What a whole answer says besides its output, which the website acts on for every feature (callSupabaseAI). */
export interface ResponseExtras {
  /** The server shortened the input to fit; the website tells the student. */
  truncated: boolean;
  /** Rankings of the Library sources the answer used, saved onto those sources. */
  assessments: SourceAssessmentUpdate[];
}

export function responseExtras(data: Record<string, unknown>): ResponseExtras {
  const meta = data.meta && typeof data.meta === 'object' ? (data.meta as { truncated?: unknown }) : null;
  return { truncated: meta?.truncated === true, assessments: parseSourceAssessments(data.sourceAssessments) };
}
