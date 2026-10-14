import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

// The session read never settles, as when a token refresh stalls.
const getSession = vi.hoisted(() => vi.fn(() => new Promise<never>(() => {})));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import { AIError, postFunction, untilAborted } from './ai-request';
import { withTurnDeadline } from './crossfire';

afterEach(() => {
  vi.clearAllMocks();
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

describe('postFunction', () => {
  it('ends at its deadline when the session read stalls, without sending the request', async () => {
    vi.useFakeTimers();
    const request = postFunction('ai', {}, undefined, async () => 'answer', 75_000).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(75_000);
    const error = await request;
    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe('timeout');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never reads the session for a request cancelled before it starts', async () => {
    const leaving = new AbortController();
    leaving.abort();
    await expect(postFunction('ai', {}, leaving.signal, async () => 'answer')).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSession).not.toHaveBeenCalled();
  });
});
