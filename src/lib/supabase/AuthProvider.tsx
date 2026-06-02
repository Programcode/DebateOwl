/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { getOAuthRedirectUrl, openExternalUrl } from '@/lib/native';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: (options?: { driveAccess?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_OPERATION_TIMEOUT_MS = 4000;

function withAuthTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), AUTH_OPERATION_TIMEOUT_MS)),
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

    const hydrateOAuthCallbackSession = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { data, error } = await withAuthTimeout(
          supabase.auth.exchangeCodeForSession(code),
          'OAuth code exchange timeout',
        );
        if (error) throw error;

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('code');
        window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}`);
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
          setLoading(false);
          Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
          Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
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
        if (data.session) {
          Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
          Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
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
      setSession(newSession);
      setLoading(false);

      // Persist Google provider tokens for later use (e.g., Google Docs export)
      // These tokens are only available immediately after OAuth, not on session refresh
      // Supabase does NOT auto-refresh provider tokens - we must do it manually
      if (newSession?.provider_token) {
        console.log('[Auth] Storing new provider_token');
        localStorage.setItem('google_provider_token', newSession.provider_token);
      }
      if (newSession?.provider_refresh_token) {
        console.log('[Auth] Storing new provider_refresh_token');
        localStorage.setItem('google_provider_refresh_token', newSession.provider_refresh_token);
      }

      if (!nextUserId) {
        resetSessionStore();
        resetSettingsStore();
        localStorage.removeItem('google_provider_token');
        localStorage.removeItem('google_provider_refresh_token');
        return;
      }

      if (prevUserId && prevUserId !== nextUserId) {
        resetSessionStore();
        resetSettingsStore();
      }

      Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
      Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
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
          queryParams: driveAccess
            ? {
              access_type: 'offline',
              prompt: 'consent',
            }
            : undefined,
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
