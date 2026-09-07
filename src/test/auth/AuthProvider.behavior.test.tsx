/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
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
  hydrateSettingsStoreMock,
  resetSessionStoreMock,
  resetSettingsStoreMock,
  hydrateSparringStoreMock,
  prepareSparringStoreMock,
  resetSparringStoreMock,
  callbackRef,
  openExternalUrlMock,
} = vi.hoisted(() => {
  const getSessionMock = vi.fn();
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
  const hydrateSettingsStoreMock = vi.fn();
  const resetSessionStoreMock = vi.fn();
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
    hydrateSettingsStoreMock,
    resetSessionStoreMock,
    resetSettingsStoreMock,
    hydrateSparringStoreMock,
    prepareSparringStoreMock,
    resetSparringStoreMock,
    callbackRef,
    openExternalUrlMock,
  };
});

vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: {
    auth: {
      getSession: getSessionMock,
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
  getOAuthRedirectUrl: () => `${window.location.origin}/app`,
  openExternalUrl: openExternalUrlMock,
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: any) => any) => selector({
    hydrateFromServer: hydrateSessionStoreMock,
    resetLocalData: resetSessionStoreMock,
  }),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: any) => any) => selector({
    hydrateFromServer: hydrateSettingsStoreMock,
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
import { crossfireStorageKey } from '@/lib/crossfire/storage';

function AuthConsumer() {
  const { loading, user, signInWithGoogle, signOut } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.id ?? 'none'}</div>
      <button onClick={() => void signInWithGoogle()} type="button">sign-in</button>
      <button onClick={() => void signInWithGoogle({ driveAccess: true })} type="button">sign-in-with-drive</button>
      <button onClick={() => void signOut()} type="button">sign-out</button>
    </div>
  );
}

function PasswordlessAuthConsumer() {
  const { signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode } = useAuth();

  return (
    <div>
      <button onClick={() => void signInWithEmailOtp(' student@example.com ')} type="button">email-otp</button>
      <button onClick={() => void verifyEmailOtp(' student@example.com ', ' 123456 ')} type="button">verify-email-otp</button>
      <button onClick={() => void signInWithDemoCode(' DEMO-AB12-CD34 ')} type="button">demo-code</button>
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
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    setSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInWithOtpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    verifyOtpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    functionsInvokeMock.mockResolvedValue({ data: { email: 'demo@example.com', tokenHash: 'hash', type: 'magiclink' }, error: null });
    openExternalUrlMock.mockResolvedValue(undefined);
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
    expect(hydrateSettingsStoreMock).toHaveBeenCalled();
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
    expect(hydrateSettingsStoreMock).toHaveBeenCalledTimes(1);
    expect(prepareSparringStoreMock).toHaveBeenCalledTimes(1);
    expect(hydrateSparringStoreMock).toHaveBeenCalledTimes(1);
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
          redirectTo: `${window.location.origin}/app`,
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
          redirectTo: `${window.location.origin}/app`,
          skipBrowserRedirect: true,
          scopes: 'https://www.googleapis.com/auth/drive.file',
          queryParams: undefined,
        },
      });
    });
  });

  it('sends an email OTP for the normalized email address', async () => {
    render(
      <AuthProvider>
        <PasswordlessAuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'email-otp' }));

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({ email: 'student@example.com' });
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

  it('exchanges PKCE codes from the callback URL and clears the query string', async () => {
    window.history.replaceState({}, '', '/app?code=pkce-code');
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

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('pkce-code');
    expect(window.location.search).toBe('');
  });

  it('fails open when PKCE callback exchange hangs', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/app?code=stalled-code');
    exchangeCodeForSessionMock.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await act(async () => {
      // Keep this in sync with the OAuth code-exchange timeout in AuthProvider.
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(warnSpy).toHaveBeenCalledWith('[Auth] init failed:', expect.any(Error));
    expect(window.location.search).toBe('?code=stalled-code');

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('propagates native browser launch failures to the caller', async () => {
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

  it('signOut delegates to Supabase and resets both stores', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign-out' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
    });

    expect(resetSessionStoreMock).toHaveBeenCalled();
    expect(resetSettingsStoreMock).toHaveBeenCalled();
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
