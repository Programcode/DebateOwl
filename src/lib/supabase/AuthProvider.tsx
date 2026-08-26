/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { getOAuthRedirectUrl, openExternalUrl } from '@/lib/native';
import { setJamUserId } from '@/lib/jam-metadata';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: (options?: { driveAccess?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_OPERATION_TIMEOUT_MS = 4000;
const OAUTH_CODE_EXCHANGE_TIMEOUT_MS = 15_000;

class AuthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthTimeoutError';
  }
}

function withAuthTimeout<T>(operation: Promise<T>, message: string, timeoutMs = AUTH_OPERATION_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => setTimeout(() => reject(new AuthTimeoutError(message)), timeoutMs)),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hydrateSessionStore = useSessionStore((state) => state.hydrateFromServer);
  const hydrateSettingsStore = useSettingsStore((state) => state.hydrateFromServer);
  const resetSessionStore = useSessionStore((state) => state.resetLocalData);
  const resetSettingsStore = useSettingsStore((state) => state.resetLocalData);
  const currentUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    let hydratedUserId: string | undefined;
    const hydrateStores = (userId?: string) => {
      if (!userId || hydratedUserId === userId) return;
      hydratedUserId = userId;
      Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
      Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
    };

    // Older clients persisted these credentials across browser sessions.
    localStorage.removeItem('google_provider_token');
    localStorage.removeItem('google_provider_refresh_token');

    const hydrateOAuthCallbackSession = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const cleanupOAuthParams = () => {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('code');
          nextUrl.searchParams.delete('state');
          nextUrl.searchParams.delete('error');
          nextUrl.searchParams.delete('error_description');
          window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}`);
        };

        let result: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;
        let preserveOAuthParams = false;
        try {
          result = await withAuthTimeout(
            supabase.auth.exchangeCodeForSession(code),
            'OAuth code exchange timeout',
            OAUTH_CODE_EXCHANGE_TIMEOUT_MS,
          );
        } catch (error) {
          preserveOAuthParams = error instanceof AuthTimeoutError;
          throw error;
        } finally {
          if (!preserveOAuthParams) cleanupOAuthParams();
        }

        const { data, error } = result;
        if (error) throw error;
        return data.session;
      }

      return null;
    };

    const init = async () => {
      try {
        const oauthSession = await hydrateOAuthCallbackSession();
        if (!mounted) return;

        if (oauthSession) {
          setSession(oauthSession);
          currentUserIdRef.current = oauthSession.user?.id;
          setJamUserId(oauthSession.user?.id);
          setLoading(false);
          hydrateStores(oauthSession.user?.id);
          return;
        }

        // In some browser states (stalled locks, blocked storage, extensions),
        // getSession() can hang long enough to look like a frozen app. If it
        // doesn't resolve quickly, fail open to the login route and rely on
        // onAuthStateChange to populate the session when available.
        const getSessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), AUTH_OPERATION_TIMEOUT_MS)),
        ]);

        if (!mounted) return;
        const { data, error } = getSessionResult;
        if (error) console.warn('[Auth] getSession error:', error.message);
        setSession(data.session ?? null);
        currentUserIdRef.current = data.session?.user?.id;
        setJamUserId(data.session?.user?.id);
        if (data.session) {
          hydrateStores(data.session.user?.id);
        }
      } catch (err) {
        console.warn('[Auth] init failed:', err);
        if (!mounted) return;
        setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[Auth] Event:', event, 'Provider Token:', newSession?.provider_token ? 'present' : 'null');

      const prevUserId = currentUserIdRef.current;
      const nextUserId = newSession?.user?.id;
      currentUserIdRef.current = nextUserId;
      setJamUserId(nextUserId);
      setSession(newSession);
      setLoading(false);

      // Provider access tokens are short-lived. Keep them only for this browser
      // session; a later export must reauthorize if no fresh token is available.
      if (newSession?.provider_token) {
        console.log('[Auth] Storing new provider_token');
        sessionStorage.setItem('google_provider_token', newSession.provider_token);
      }

      if (!nextUserId) {
        hydratedUserId = undefined;
        resetSessionStore();
        resetSettingsStore();
        sessionStorage.removeItem('google_provider_token');
        localStorage.removeItem('google_provider_token');
        // Remove refresh tokens written by older clients as well; this client
        // never persists them because they are long-lived credentials.
        localStorage.removeItem('google_provider_refresh_token');
        return;
      }

      if (prevUserId && prevUserId !== nextUserId) {
        hydratedUserId = undefined;
        resetSessionStore();
        resetSettingsStore();
      }

      hydrateStores(nextUserId);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateSessionStore, hydrateSettingsStore, resetSessionStore, resetSettingsStore]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle: async ({ driveAccess = false } = {}) => {
      // Always use the SDK-generated URL so PKCE's code_verifier is written
      // to storage before redirect. The previous Promise.race against a 1200ms
      // timeout could fall back to a hand-built URL that skipped PKCE — Google
      // would then call back to /app but the SDK couldn't exchange the code,
      // leaving the user stuck on "Redirecting…" until manual refresh.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getOAuthRedirectUrl(),
          skipBrowserRedirect: true,
          ...(driveAccess ? { scopes: 'https://www.googleapis.com/auth/drive.file' } : {}),
          queryParams: undefined,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('Google sign-in could not start. Please try again.');

      await openExternalUrl(data.url);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      resetSessionStore();
      resetSettingsStore();
    },
  }), [session, loading, resetSessionStore, resetSettingsStore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
