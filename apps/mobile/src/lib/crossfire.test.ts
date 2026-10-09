import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));

import { AIError } from './ai-request';
import { untilAborted, withTurnDeadline } from './crossfire';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTurnDeadline', () => {
  it('times out a turn whose settings read stalls, 75 s after the turn started', async () => {
    vi.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    const turn = withTurnDeadline(new AbortController().signal, (signal) => untilAborted(stalled, signal));
    const outcome = turn.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(74_999);
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe('timeout');
  });

  it('cancels a stalled read as soon as the student leaves', async () => {
    const leaving = new AbortController();
    const turn = withTurnDeadline(leaving.signal, (signal) => untilAborted(new Promise<never>(() => {}), signal));
    leaving.abort();
    await expect(turn).rejects.toMatchObject({ name: 'AbortError' });
  });
});
