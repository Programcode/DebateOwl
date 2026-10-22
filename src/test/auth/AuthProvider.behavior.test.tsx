/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
  getUserMock,
  onAuthStateChangeMock,
  signInWithOAuthMock,
  signInWithOtpMock,
  verifyOtpMock,
  functionsInvokeMock,
  setSessionMock,
  exchangeCodeForSessionMock,
  signOutMock,
  unsubscribeMock,
  hydrateSessionStoreMock,
  prepareSessionStoreMock,
  hydrateSettingsStoreMock,
  prepareSettingsStoreMock,
  resetSessionStoreMock,
  clearSessionStoreMock,
  resetSettingsStoreMock,
  hydrateSparringStoreMock,
  prepareSparringStoreMock,
  resetSparringStoreMock,
  callbackRef,
  openExternalUrlMock,
} = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const getUserMock = vi.fn();
  const onAuthStateChangeMock = vi.fn();
  const signInWithOAuthMock = vi.fn();
  const signInWithOtpMock = vi.fn();
  const verifyOtpMock = vi.fn();
  const functionsInvokeMock = vi.fn();
  const setSessionMock = vi.fn();
  const exchangeCodeForSessionMock = vi.fn();
  const signOutMock = vi.fn();
  const unsubscribeMock = vi.fn();
  const hydrateSessionStoreMock = vi.fn();
  const prepareSessionStoreMock = vi.fn();
  const hydrateSettingsStoreMock = vi.fn();
  const prepareSettingsStoreMock = vi.fn();
  const resetSessionStoreMock = vi.fn();
  const clearSessionStoreMock = vi.fn();
  const resetSettingsStoreMock = vi.fn();
  const hydrateSparringStoreMock = vi.fn();
  const prepareSparringStoreMock = vi.fn();
  const resetSparringStoreMock = vi.fn();
  const callbackRef: { current: ((event: string, session: any) => void) | null } = { current: null };
  const openExternalUrlMock = vi.fn();

  onAuthStateChangeMock.mockImplementation((callback: (event: string, session: any) => void) => {
    callbackRef.current = callback;
    return { data: { subscription: { unsubscribe: unsubscribeMock } } };
  });

  return {
    getSessionMock,
    getUserMock,
    onAuthStateChangeMock,
    signInWithOAuthMock,
    signInWithOtpMock,
    verifyOtpMock,
    functionsInvokeMock,
    setSessionMock,
    exchangeCodeForSessionMock,
    signOutMock,
    unsubscribeMock,
    hydrateSessionStoreMock,
    prepareSessionStoreMock,
    hydrateSettingsStoreMock,
    prepareSettingsStoreMock,
    resetSessionStoreMock,
    clearSessionStoreMock,
    resetSettingsStoreMock,
    hydrateSparringStoreMock,
    prepareSparringStoreMock,
    resetSparringStoreMock,
    callbackRef,
    openExternalUrlMock,
  };
});

vi.mock('@/lib/supabase/client', () => ({
  AUTH_STORAGE_KEY: 'debate-auth-production',
  SUPABASE_URL: 'https://example.supabase.co',
  setActiveAccessToken: vi.fn(),
  supabase: {
    auth: {
      getSession: getSessionMock,
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithOAuth: signInWithOAuthMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      setSession: setSessionMock,
      exchangeCodeForSession: exchangeCodeForSessionMock,
      signOut: signOutMock,
    },
    functions: {
      invoke: functionsInvokeMock,
    },
  },
}));

vi.mock('@/lib/native', () => ({
  openExternalUrl: openExternalUrlMock,
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: any) => any) => selector({
    hydrateFromServer: hydrateSessionStoreMock,
    prepareForUser: prepareSessionStoreMock,
    resetLocalData: resetSessionStoreMock,
    clearSession: clearSessionStoreMock,
  }),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: any) => any) => selector({
    hydrateFromServer: hydrateSettingsStoreMock,
    prepareForUser: prepareSettingsStoreMock,
    resetLocalData: resetSettingsStoreMock,
  }),
}));

vi.mock('@/lib/stores/sparring-store', () => ({
  useSparringStore: (selector: (state: any) => any) => selector({
    hydrateSavedSessions: hydrateSparringStoreMock,
    prepareForUser: prepareSparringStoreMock,
    resetLocalData: resetSparringStoreMock,
  }),
}));

import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';
import { resetSessionExpiryCheck } from '@/lib/supabase/session-expiry';
import { crossfireStorageKey } from '@/lib/crossfire/storage';
import { useDebateStore } from '@/lib/stores/debate-store';

function AuthConsumer() {
  const { loading, user, callbackError, signInWithGoogle, signOut } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.id ?? 'none'}</div>
      <div data-testid="callback-error">{callbackError ?? 'none'}</div>
      <button onClick={() => void signInWithGoogle()} type="button">sign-in</button>
      <button onClick={() => void signInWithGoogle({ driveAccess: true })} type="button">sign-in-with-drive</button>
      <button onClick={() => void signOut()} type="button">sign-out</button>
    </div>
  );
}

function PasswordlessAuthConsumer() {
  const { signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode } = useAuth();
  const [error, setError] = useState('');

  return (
    <div>
      <button onClick={() => void signInWithEmailOtp(' student@example.com ')} type="button">email-otp</button>
      <button onClick={() => void verifyEmailOtp(' student@example.com ', ' 123456 ')} type="button">verify-email-otp</button>
      <button onClick={() => void signInWithDemoCode(' DEMO-AB12-CD34 ').catch((reason: Error) => setError(reason.message))} type="button">demo-code</button>
      <span data-testid="passwordless-error">{error}</span>
    </div>
  );
}

function SignInErrorConsumer() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState('');

  return (
    <div>
      <button onClick={() => void signInWithGoogle().catch((err: Error) => setError(err.message))} type="button">
        sign-in-with-error
      </button>
      <div data-testid="sign-in-error">{error}</div>
    </div>
  );
}

describe('AuthProvider behavior', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    localStorage.clear();
    vi.clearAllMocks();
    callbackRef.current = null;
    hydrateSessionStoreMock.mockResolvedValue(undefined);
    hydrateSettingsStoreMock.mockResolvedValue(undefined);
    hydrateSparringStoreMock.mockResolvedValue(undefined);
    resetSessionExpiryCheck();
    // No status: a lookup that did not answer is an outage, so the local session stands.
    // A user id here would also win currentUserId() over the session the test arranged.
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'unavailable' } });
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    setSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInWithOtpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    verifyOtpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    functionsInvokeMock.mockResolvedValue({ data: { email: 'demo@example.com', tokenHash: 'hash', type: 'magiclink' }, error: null });
    openExternalUrlMock.mockResolvedValue(undefined);
  });

  it('signs out once and does not load data when the user lookup is refused', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_1' }, access_token: 'token' } },
      error: null,
    });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 403, message: 'Forbidden' } });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(hydrateSessionStoreMock).not.toHaveBeenCalled();
    expect(hydrateSettingsStoreMock).not.toHaveBeenCalled();
    expect(hydrateSparringStoreMock).not.toHaveBeenCalled();

    await act(async () => {
      callbackRef.current?.('SIGNED_IN', { user: { id: 'user_1' }, access_token: 'token' });
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(hydrateSessionStoreMock).not.toHaveBeenCalled();
    expect(hydrateSettingsStoreMock).not.toHaveBeenCalled();
    expect(hydrateSparringStoreMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('hydrates stores when an initial session exists', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_1' }, access_token: 'token' } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('user_1');
    expect(hydrateSessionStoreMock).toHaveBeenCalled();
    expect(prepareSessionStoreMock).toHaveBeenCalledWith('user_1');
    expect(hydrateSettingsStoreMock).toHaveBeenCalled();
    expect(prepareSettingsStoreMock).toHaveBeenCalledWith('user_1');
    expect(prepareSparringStoreMock).toHaveBeenCalledWith('user_1');
    expect(hydrateSparringStoreMock).toHaveBeenCalled();
    expect(onAuthStateChangeMock).toHaveBeenCalled();
  });

  it('does not rehydrate stores for an auth event with the same user', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_1' }, access_token: 'token' } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    await act(async () => {
      callbackRef.current?.('INITIAL_SESSION', { user: { id: 'user_1' }, access_token: 'token' });
    });

    expect(hydrateSessionStoreMock).toHaveBeenCalledTimes(1);
    expect(prepareSessionStoreMock).toHaveBeenCalledTimes(1);
    expect(hydrateSettingsStoreMock).toHaveBeenCalledTimes(1);
    expect(prepareSettingsStoreMock).toHaveBeenCalledTimes(1);
    expect(prepareSparringStoreMock).toHaveBeenCalledTimes(1);
    expect(hydrateSparringStoreMock).toHaveBeenCalledTimes(1);
  });

  it('clears user data but preserves the interface language on cold signed-out startup', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      callbackRef.current?.('INITIAL_SESSION', null);
    });

    expect(resetSessionStoreMock).toHaveBeenCalled();
    expect(resetSettingsStoreMock).toHaveBeenCalledWith(true);
    expect(resetSparringStoreMock).toHaveBeenCalled();

    await act(async () => {
      callbackRef.current?.('SIGNED_IN', { user: { id: 'user_2' }, access_token: 'token' });
    });

    expect(hydrateSessionStoreMock).toHaveBeenCalled();
    expect(prepareSessionStoreMock).toHaveBeenCalledWith('user_2');
    expect(hydrateSettingsStoreMock).toHaveBeenCalled();
    expect(prepareSettingsStoreMock).toHaveBeenCalledWith('user_2');
    expect(prepareSparringStoreMock).toHaveBeenCalledWith('user_2');
  });

  it('drops another account\'s current debate before the app unlocks', async () => {
    useDebateStore.setState({
      ownerUserId: 'user_a',
      debates: [{
        id: 'debate-a',
        motion: 'Secret motion',
        settings: {},
        instructions: '',
        lastActivityAt: 1,
        createdAt: 1,
      }],
      currentDebateId: 'debate-a',
    });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_b' }, access_token: 'token' } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(useDebateStore.getState().ownerUserId).toBe('user_b');
    expect(useDebateStore.getState().debates).toEqual([]);
    expect(useDebateStore.getState().currentDebateId).toBeNull();
  });

  it('removes refresh tokens persisted by older clients during startup', async () => {
    localStorage.setItem('google_provider_refresh_token', 'legacy-refresh-token');
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_1' }, access_token: 'token' } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(localStorage.getItem('google_provider_refresh_token')).toBeNull();
  });

  it('logs getSession errors and keeps provider usable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'session lookup failed' },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(warnSpy).toHaveBeenCalledWith('[Auth] getSession error:', 'session lookup failed');
    warnSpy.mockRestore();
  });

  it('keeps provider access tokens only for the browser session', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'existing-user' } } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      callbackRef.current?.('SIGNED_IN', {
        user: { id: 'existing-user' },
        provider_token: 'provider-token',
        provider_refresh_token: 'provider-refresh-token',
      });
    });

    expect(sessionStorage.getItem('google_provider_token')).toBe('provider-token');
    expect(localStorage.getItem('google_provider_token')).toBeNull();
    expect(localStorage.getItem('google_provider_refresh_token')).toBeNull();
    expect(hydrateSessionStoreMock).toHaveBeenCalled();
    expect(hydrateSettingsStoreMock).toHaveBeenCalled();
  });

  it('resets stores and clears provider tokens when signed out', async () => {
    sessionStorage.setItem('google_provider_token', 't');
    localStorage.setItem('google_provider_refresh_token', 'r');
    localStorage.setItem(crossfireStorageKey('user_2'), 'crossfire-draft');

    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_2' } } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      callbackRef.current?.('SIGNED_OUT', null);
    });

    expect(resetSessionStoreMock).toHaveBeenCalled();
    expect(resetSettingsStoreMock).toHaveBeenCalled();
    expect(sessionStorage.getItem('google_provider_token')).toBeNull();
    expect(localStorage.getItem('google_provider_token')).toBeNull();
    expect(localStorage.getItem('google_provider_refresh_token')).toBeNull();
    expect(localStorage.getItem(crossfireStorageKey('user_2'))).toBeNull();
  });

  it('resets stores when auth state changes to a different user', async () => {
    localStorage.setItem(crossfireStorageKey('user_old'), 'old-draft');
    localStorage.setItem(crossfireStorageKey('user_new'), 'new-draft');
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user_old' } } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('user_old');
    });

    await act(async () => {
      callbackRef.current?.('TOKEN_REFRESHED', { user: { id: 'user_new' } });
    });

    expect(resetSessionStoreMock).toHaveBeenCalled();
    expect(resetSettingsStoreMock).toHaveBeenCalled();
    expect(localStorage.getItem(crossfireStorageKey('user_old'))).toBeNull();
    expect(localStorage.getItem(crossfireStorageKey('user_new'))).toBe('new-draft');
  });

  it('signInWithGoogle gets a Supabase OAuth URL and redirects', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: undefined,
        },
      });
    });
  });

  it('does not request an offline token grant for Drive access', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign-in-with-drive' }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          scopes: 'https://www.googleapis.com/auth/drive.file',
          queryParams: undefined,
        },
      });
    });
  });

  it('allows email OTP signup for the normalized email address', async () => {
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'email-otp' }));

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({
        email: 'student@example.com',
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
    });
  });

  it('verifies an email OTP with the normalized email and token', async () => {
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'verify-email-otp' }));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        email: 'student@example.com',
        token: '123456',
        type: 'email',
      });
    });
  });

  it('redeems a demo code and verifies the returned magic-link handoff', async () => {
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'demo-code' }));

    await waitFor(() => {
      expect(functionsInvokeMock).toHaveBeenCalledWith('demo-code-login', {
        body: {
          code: 'DEMO-AB12-CD34',
          browserFingerprint: expect.any(String),
        },
      });
      expect(verifyOtpMock).toHaveBeenCalledWith({
        token_hash: 'hash',
        type: 'magiclink',
      });
    });
  });

  it('surfaces a demo-code denial returned by the Edge Function', async () => {
    functionsInvokeMock.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'This demo code has expired.' })) },
    });
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'demo-code' }));

    await waitFor(() => expect(screen.getByTestId('passwordless-error')).toHaveTextContent('This demo code has expired.'));
  });

  it('rejects an invalid demo-code session handoff', async () => {
    functionsInvokeMock.mockResolvedValue({ data: { tokenHash: 'hash', type: 'magiclink' }, error: null });
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'demo-code' }));

    await waitFor(() => expect(screen.getByTestId('passwordless-error')).toHaveTextContent('invalid session handoff'));
  });

  it('exchanges the callback code with its own flow verifier and keeps the deep link', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code&sb_flow_id=0123456789abcdef&next=%2Fapp%2Fhistory');
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'pkce-user' } } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('pkce-user');
    });

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('pkce-code', { flowId: '0123456789abcdef' });
    expect(window.location.search).toBe('?next=%2Fapp%2Fhistory');
  });

  it('exchanges a callback code without a flow id the old way', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code');
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'pkce-user' } } },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('pkce-user');
    });
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('pkce-code', undefined);
    expect(window.location.search).toBe('');
  });

  it('stays loading while the callback exchange runs, even when auth reports no session yet', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code');
    let finishExchange!: (value: unknown) => void;
    exchangeCodeForSessionMock.mockReturnValue(new Promise((resolve) => { finishExchange = resolve; }));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    // auth-js announces the empty stored session while the code is still being exchanged.
    act(() => callbackRef.current?.('INITIAL_SESSION', null));
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    // A reload during the spinner must still find the unused code and its flow.
    expect(window.location.search).toBe('?code=pkce-code');

    await act(async () => {
      finishExchange({ data: { session: { user: { id: 'pkce-user' }, access_token: 'token' } }, error: null });
    });

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('pkce-user'));
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('stays loading through the stored session\'s events until another account\'s callback exchange settles', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code');
    let finishExchange!: (value: unknown) => void;
    exchangeCodeForSessionMock.mockReturnValue(new Promise((resolve) => { finishExchange = resolve; }));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    // auth-js restores the account already stored in this browser while B's code is exchanged.
    act(() => callbackRef.current?.('INITIAL_SESSION', { user: { id: 'stored-user' }, access_token: 'stored' }));
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      finishExchange({ data: { session: { user: { id: 'callback-user' }, access_token: 'token' } }, error: null });
    });
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('callback-user');
  });

  it('ends the callback wait when the stored session\'s user lookup never answers', async () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_code=otp_expired');
      getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'stored-user' }, access_token: 'stored' } }, error: null });
      getUserMock.mockReturnValue(new Promise(() => {}));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      // Auth did not answer: an outage keeps the stored session, and the page moves on.
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('stored-user');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a callback error when the stored session is restored afterwards', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_code=otp_expired');
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'stored-user' }, access_token: 'stored' } }, error: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    act(() => callbackRef.current?.('SIGNED_IN', { user: { id: 'stored-user' }, access_token: 'stored' }));
    expect(screen.getByTestId('callback-error')).toHaveTextContent('link-expired');
  });

  it('says why a callback exchange failed and keeps any session the browser already had', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code&sb_flow_id=0123456789abcdef');
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { session: null },
      error: Object.assign(new Error('PKCE code verifier not found in storage.'), { code: 'pkce_code_verifier_not_found' }),
    });
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'existing-user' }, access_token: 'token' } }, error: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('callback-error')).toHaveTextContent('other-browser');
    expect(screen.getByTestId('user')).toHaveTextContent('existing-user');
    expect(window.location.search).toBe('');
    warnSpy.mockRestore();
  });

  it('reads an expired-link error from the callback URL without exchanging anything', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('callback-error')).toHaveTextContent('link-expired');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('ignores a code query parameter outside the callback route', async () => {
    window.history.replaceState({}, '', '/app/history?code=not-ours');

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=not-ours');
  });

  it('stops waiting and reports a failed sign-in when the callback exchange hangs', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/auth/callback?code=stalled-code');
    exchangeCodeForSessionMock.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    act(() => callbackRef.current?.('INITIAL_SESSION', null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      // Keep this in sync with the OAuth code-exchange timeout in AuthProvider.
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('callback-error')).toHaveTextContent('timed-out');
    // A timeout is not a final answer: the code may still be good, so a reload can retry it.
    expect(window.location.search).toBe('?code=stalled-code');

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('propagates external browser launch failures to the caller', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' },
      error: null,
    });
    openExternalUrlMock.mockRejectedValue(new Error('Safari unavailable'));

    render(
      <AuthProvider>
        <SignInErrorConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign-in-with-error' }));

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent('Safari unavailable');
    });
  });

  it('signOut ends only this device\'s session and resets both stores', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign-out' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    });

    expect(resetSessionStoreMock).toHaveBeenCalled();
    expect(resetSettingsStoreMock).toHaveBeenCalled();
  });

  it('leaveEnvironment clears this project\'s session and data even when sign-out hangs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signOutMock.mockReturnValue(new Promise(() => {}));
      localStorage.setItem('debate-auth-production', 'session');
      localStorage.setItem('debate-auth-production-user', 'user');
      localStorage.setItem('debate-auth-staging', 'other-project-session');
      sessionStorage.setItem('google_provider_token', 'production-google-token');
      localStorage.setItem('google_provider_token', 'legacy-google-token');
      localStorage.setItem('google_provider_refresh_token', 'legacy-refresh-token');
      useDebateStore.setState({ currentDebateId: 'debate-1', oneOff: true });
      let left = false;
      function Leaver() {
        const { leaveEnvironment } = useAuth();
        return <button type="button" onClick={() => void leaveEnvironment().then(() => { left = true; })}>leave</button>;
      }
      render(<AuthProvider><Leaver /></AuthProvider>);

      fireEvent.click(screen.getByRole('button', { name: 'leave' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

      expect(left).toBe(true);
      // Leaving must end only this browser's session, not the account's sessions on other devices.
      expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
      expect(localStorage.getItem('debate-auth-production')).toBeNull();
      expect(localStorage.getItem('debate-auth-production-user')).toBeNull();
      expect(localStorage.getItem('debate-auth-staging')).toBe('other-project-session');
      expect(sessionStorage.getItem('google_provider_token')).toBeNull();
      expect(localStorage.getItem('google_provider_token')).toBeNull();
      expect(localStorage.getItem('google_provider_refresh_token')).toBeNull();
      expect(resetSessionStoreMock).toHaveBeenCalled();
      expect(clearSessionStoreMock).toHaveBeenCalled();
      expect(resetSettingsStoreMock).toHaveBeenCalled();
      expect(resetSparringStoreMock).toHaveBeenCalled();
      expect(useDebateStore.getState()).toMatchObject({ currentDebateId: null, oneOff: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('discardTabState clears only this tab\'s own storage, not shared stores', () => {
    sessionStorage.setItem('google_provider_token', 'old-project-google-token');
    localStorage.setItem('debate-auth-production', 'session');
    useDebateStore.setState({ currentDebateId: 'debate-1' });
    let discard: (() => void) | undefined;
    function Holder(): null {
      discard = useAuth().discardTabState;
      return null;
    }
    render(<AuthProvider><Holder /></AuthProvider>);

    act(() => discard!());

    expect(sessionStorage.getItem('google_provider_token')).toBeNull();
    expect(resetSparringStoreMock).toHaveBeenCalled();
    expect(localStorage.getItem('debate-auth-production')).toBe('session');
    expect(resetSessionStoreMock).not.toHaveBeenCalled();
    expect(clearSessionStoreMock).not.toHaveBeenCalled();
    expect(resetSettingsStoreMock).not.toHaveBeenCalled();
    expect(useDebateStore.getState().currentDebateId).toBe('debate-1');
  });

  it('unsubscribes auth listener on unmount', async () => {
    const { unmount } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('throws if useAuth is used outside provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const expectedError = 'useAuth must be used within AuthProvider';
    const preventExpectedErrorLog = (event: ErrorEvent) => {
      if (event.error instanceof Error && event.error.message === expectedError) {
        event.preventDefault();
      }
    };

    function BrokenConsumer(): null {
      useAuth();
      return null;
    }

    window.addEventListener('error', preventExpectedErrorLog);
    try {
      expect(() => render(<BrokenConsumer />)).toThrow(expectedError);
    } finally {
      window.removeEventListener('error', preventExpectedErrorLog);
      errorSpy.mockRestore();
    }
  });
});
