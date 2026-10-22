import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { isAuthRejection, setActiveAccessToken, supabase, SUPABASE_URL } from '@/lib/supabase/client';
import {
  clearSessionExpiredNotice,
  resetSessionExpiryCheck,
  sessionExpiredNotice,
  verifySessionAfterRejection,
} from '@/lib/supabase/session-expiry';

function fakeAuth(refreshError: unknown) {
  return {
    refreshSession: vi.fn(async () => ({ data: { user: null, session: null }, error: refreshError })),
    signOut: vi.fn(async () => ({ error: null })),
  };
}

describe('a refused session', () => {
  beforeEach(() => {
    resetSessionExpiryCheck();
    clearSessionExpiredNotice();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setActiveAccessToken(null, null);
  });

  it('counts only auth refusals, not policy answers', () => {
    expect(isAuthRejection(`${SUPABASE_URL}/auth/v1/user`, 403)).toBe(true);
    expect(isAuthRejection(`${SUPABASE_URL}/auth/v1/user`, 401)).toBe(true);
    expect(isAuthRejection(`${SUPABASE_URL}/rest/v1/flowcharts?select=*`, 401)).toBe(true);
    expect(isAuthRejection(`${SUPABASE_URL}/functions/v1/announcements`, 401)).toBe(true);
    // RLS refusals and server errors are not a dead session.
    expect(isAuthRejection(`${SUPABASE_URL}/rest/v1/flowcharts`, 403)).toBe(false);
    expect(isAuthRejection(`${SUPABASE_URL}/rest/v1/flowcharts`, 503)).toBe(false);
    // The check itself calls these; counting them would loop.
    expect(isAuthRejection(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, 400)).toBe(false);
    expect(isAuthRejection(`${SUPABASE_URL}/auth/v1/logout?scope=local`, 401)).toBe(false);
  });

  it('signs out locally and leaves a note when Auth refuses the refresh too', async () => {
    const auth = fakeAuth(new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'));

    await expect(verifySessionAfterRejection(auth)).resolves.toBe('expired');

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(sessionExpiredNotice()).toBe(true);
  });

  it('treats a session missing from storage as expired', async () => {
    const auth = fakeAuth(new AuthSessionMissingError());
    await expect(verifySessionAfterRejection(auth)).resolves.toBe('expired');
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ['an Auth outage', new AuthRetryableFetchError('Service Unavailable', 503)],
    ['a rate limit', new AuthApiError('Too many requests', 429, 'over_request_rate_limit')],
    ['an Auth server error', new AuthApiError('Internal error', 500, 'unexpected_failure')],
  ])('keeps the session on %s', async (_label, error) => {
    const auth = fakeAuth(error);

    await expect(verifySessionAfterRejection(auth)).resolves.toBe('kept');

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(sessionExpiredNotice()).toBe(false);
  });

  it('keeps a session whose refresh works, and does not refresh again for the rest of the burst', async () => {
    let now = 1_000_000;
    const auth = fakeAuth(null);

    await expect(verifySessionAfterRejection(auth, () => now)).resolves.toBe('kept');
    now += 9_000;
    await expect(verifySessionAfterRejection(auth, () => now)).resolves.toBe('skipped');
    now += 2_000;
    await expect(verifySessionAfterRejection(auth, () => now)).resolves.toBe('kept');

    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('runs one check at a time', async () => {
    let finish!: () => void;
    const auth = {
      refreshSession: vi.fn(() => new Promise<{ data: { user: null; session: null }; error: null }>((resolve) => {
        finish = () => resolve({ data: { user: null, session: null }, error: null });
      })),
      signOut: vi.fn(),
    };

    const first = verifySessionAfterRejection(auth);
    await expect(verifySessionAfterRejection(auth)).resolves.toBe('skipped');
    finish();
    await expect(first).resolves.toBe('kept');
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });

  it('checks the session after a refused signed-in request, and ignores signed-out ones', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"JWT expired"}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));
    const refresh = vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({ data: { user: null, session: null }, error: null } as never);

    setActiveAccessToken(null, null);
    await supabase.from('flowcharts').select('id');
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();

    setActiveAccessToken('revoked-token', 'user-1');
    await supabase.from('flowcharts').select('id');
    // Not inside the request: supabase-js may still hold its session lock there.
    expect(refresh).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
