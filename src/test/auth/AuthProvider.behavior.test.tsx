/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
  onAuthStateChangeMock,
  signInWithOAuthMock,
  signOutMock,
  unsubscribeMock,
  hydrateSessionStoreMock,
  hydrateSettingsStoreMock,
  resetSessionStoreMock,
  resetSettingsStoreMock,
  callbackRef,
} = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const onAuthStateChangeMock = vi.fn();
  const signInWithOAuthMock = vi.fn();
  const signOutMock = vi.fn();
  const unsubscribeMock = vi.fn();
  const hydrateSessionStoreMock = vi.fn();
  const hydrateSettingsStoreMock = vi.fn();
  const resetSessionStoreMock = vi.fn();
  const resetSettingsStoreMock = vi.fn();
  const callbackRef: { current: ((event: string, session: any) => void) | null } = { current: null };

  onAuthStateChangeMock.mockImplementation((callback: (event: string, session: any) => void) => {
    callbackRef.current = callback;
    return { data: { subscription: { unsubscribe: unsubscribeMock } } };
  });

  return {
    getSessionMock,
    onAuthStateChangeMock,
    signInWithOAuthMock,
    signOutMock,
    unsubscribeMock,
    hydrateSessionStoreMock,
    hydrateSettingsStoreMock,
    resetSessionStoreMock,
    resetSettingsStoreMock,
    callbackRef,
  };
});

vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithOAuth: signInWithOAuthMock,
      signOut: signOutMock,
    },
  },
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

import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';

function AuthConsumer() {
  const { loading, user, signInWithGoogle, signOut } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.id ?? 'none'}</div>
      <button onClick={() => void signInWithGoogle()} type="button">sign-in</button>
      <button onClick={() => void signOut()} type="button">sign-out</button>
    </div>
  );
}

describe('AuthProvider behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callbackRef.current = null;
    hydrateSessionStoreMock.mockResolvedValue(undefined);
    hydrateSettingsStoreMock.mockResolvedValue(undefined);
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
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
    expect(onAuthStateChangeMock).toHaveBeenCalled();
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

  it('handles auth state change events and persists provider tokens', async () => {
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

    expect(localStorage.getItem('google_provider_token')).toBe('provider-token');
    expect(localStorage.getItem('google_provider_refresh_token')).toBe('provider-refresh-token');
    expect(hydrateSessionStoreMock).toHaveBeenCalled();
    expect(hydrateSettingsStoreMock).toHaveBeenCalled();
  });

  it('resets stores and clears provider tokens when signed out', async () => {
    localStorage.setItem('google_provider_token', 't');
    localStorage.setItem('google_provider_refresh_token', 'r');

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
    expect(localStorage.getItem('google_provider_token')).toBeNull();
    expect(localStorage.getItem('google_provider_refresh_token')).toBeNull();
  });

  it('resets stores when auth state changes to a different user', async () => {
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

    function BrokenConsumer() {
      useAuth();
      return null;
    }

    expect(() => render(<BrokenConsumer />)).toThrow('useAuth must be used within AuthProvider');
    errorSpy.mockRestore();
  });
});
