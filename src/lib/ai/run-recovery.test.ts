import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { LiveStreamError } from '@/lib/ai/live';
import { RUN_RESULT_MISSING_MS, RUN_RESULT_POLL_MS } from '@/lib/ai/run-recovery';

// A live request whose stream drops: the answer the server stored is read
// back by the id the request sent, instead of failing with "check your
// connection".

const { invokeWith, rows, queries } = vi.hoisted(() => ({
  invokeWith: vi.fn(),
  /** What each successive read of ai_run_results returns. */
  rows: [] as Array<Record<string, unknown> | null>,
  queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));

vi.mock('@/lib/observability', () => ({ captureException: vi.fn(), captureProductEvent: vi.fn() }));
vi.mock('@/lib/query-client', () => ({ refreshAIUsage: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: () => 'token',
  SUPABASE_URL: 'http://test-supabase.local',
  invokeAuthenticatedFunction: vi.fn(),
  invokeAuthenticatedFunctionWith: invokeWith,
  supabase: {
    auth: { getSession: vi.fn() },
    from: (table: string) => {
      const query = { table, filters: {} as Record<string, unknown> };
      queries.push(query);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          query.filters[column] = value;
          return chain;
        },
        maybeSingle: async (): Promise<{ data: Record<string, unknown> | null; error: null }> => ({ data: (rows.length > 1 ? rows.shift() : rows[0]) ?? null, error: null }),
      };
      return chain;
    },
  },
}));

const { callSupabaseAI } = await import('@/lib/ai/request');
const { AINetworkError, AIProviderError, AIResponseError } = await import('@/lib/ai/errors');

const config = { provider: 'openrouter' as const, model: 'auto-fast' };
const live = { onDraft: () => {} };

function dropStream(reason: 'dropped' | 'unreadable' = 'dropped') {
  invokeWith.mockImplementation(async () => ({ data: null, error: new FunctionsFetchError(new LiveStreamError(reason)) }));
}

const sentResultKey = () => (invokeWith.mock.calls[0][1] as { body: { resultKey?: string } }).body.resultKey;

beforeEach(() => {
  invokeWith.mockReset();
  rows.length = 0;
  queries.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a live request whose stream dropped', () => {
  it('returns the answer the server stored for it', async () => {
    invokeWith.mockImplementationOnce(async (_name: string, options: { body: { resultKey: string } }) => {
      // The server finished and stored this run's result; the stream never delivered it.
      rows.push({ result_key: options.body.resultKey, status: 200, body: { output: { thesis: 'Kept' } } });
      return { data: null, error: new FunctionsFetchError(new LiveStreamError('dropped')) };
    });
    const result = await callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null });
    expect(result).toEqual({ output: { thesis: 'Kept' } });
    expect(sentResultKey()).toMatch(/^req_\d+_[a-z0-9]+$/);
    expect(queries[0]).toMatchObject({ table: 'ai_run_results', filters: { feature: 'generate' } });
  });

  it('waits for a run that is still writing, then returns its answer', async () => {
    vi.useFakeTimers();
    let key = '';
    invokeWith.mockImplementation(async (_name: string, options: { body: { resultKey: string } }) => {
      key = options.body.resultKey;
      rows.push({ result_key: key, status: null, body: null }, { result_key: key, status: 200, body: { output: { done: true } } });
      return { data: null, error: new FunctionsFetchError(new LiveStreamError('stalled')) };
    });
    const pending = callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null });
    await vi.advanceTimersByTimeAsync(RUN_RESULT_POLL_MS);
    await expect(pending).resolves.toEqual({ output: { done: true } });
  });

  it('reports the stored failure, including that it was not charged', async () => {
    invokeWith.mockImplementation(async (_name: string, options: { body: { resultKey: string } }) => {
      rows.push({ result_key: options.body.resultKey, status: 500, body: { error: 'AI request failed. Please try again.', code: 'provider_error', charged: false } });
      return { data: null, error: new FunctionsFetchError(new LiveStreamError('dropped')) };
    });
    const error = await callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as InstanceType<typeof AIProviderError>).notCharged).toBe(true);
  });

  it('is a connection failure when nothing was stored, and a damaged answer when the result was unreadable', async () => {
    vi.useFakeTimers();
    dropStream('dropped');
    const pending = callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(RUN_RESULT_MISSING_MS + RUN_RESULT_POLL_MS);
    expect(await pending).toBeInstanceOf(AINetworkError);

    dropStream('unreadable');
    const damaged = callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(RUN_RESULT_MISSING_MS + RUN_RESULT_POLL_MS);
    expect(await damaged).toBeInstanceOf(AIResponseError);
  });

  it('does not take another run\'s stored answer', async () => {
    rows.push({ result_key: 'req_1_someoneelse', status: 200, body: { output: { thesis: 'Other tab' } } });
    dropStream();
    const error = await callSupabaseAI('generate', { motion: 'Homework' }, config, { live, debateId: null }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AINetworkError);
  });
});
