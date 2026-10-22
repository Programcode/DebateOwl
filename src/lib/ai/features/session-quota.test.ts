import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signal: null as AbortSignal | null }));

vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: () => 'token',
  // A quota check that never answers.
  invokeAuthenticatedFunction: vi.fn((_name: string, options: { signal?: AbortSignal }) => {
    mocks.signal = options.signal ?? null;
    return new Promise(() => undefined);
  }),
}));

import { checkSessionQuota, QUOTA_CHECK_TIMEOUT_MS } from './session-quota';

describe('checkSessionQuota', () => {
  afterEach(() => vi.useRealTimers());

  it('gives up on a stalled check, so Start goes ahead and the request is cancelled', async () => {
    vi.useFakeTimers();
    const result = checkSessionQuota('sparring', { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
    await vi.advanceTimersByTimeAsync(QUOTA_CHECK_TIMEOUT_MS);
    await expect(result).resolves.toBeNull();
    expect(mocks.signal?.aborted).toBe(true);
  });
});
