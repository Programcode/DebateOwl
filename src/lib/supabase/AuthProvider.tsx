/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { setActiveAccessToken, supabase } from './client';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useDebateStore } from '@/lib/stores/debate-store';
import { getOAuthRedirectUrl, openExternalUrl } from '@/lib/native';
import { setJamUserId } from '@/lib/jam-metadata';
import { clearCrossfireDraftOnAuthChange } from '@/lib/crossfire/storage';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: (options?: { driveAccess?: boolean }) => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithDemoCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_OPERATION_TIMEOUT_MS = 4000;
const OAUTH_CODE_EXCHANGE_TIMEOUT_MS = 15_000;
const DEMO_FINGERPRINT_STORAGE_KEY = 'debate-demo-browser-fingerprint';

type DemoCodeHandoff = {
  email: string;
  tokenHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDemoCodeHandoff(value: unknown): DemoCodeHandoff {
  if (!isRecord(value) || typeof value.email !== 'string' || value.type !== 'magiclink') {
    throw new Error('Demo sign-in returned an invalid session handoff.');
  }

  const tokenHash = typeof value.tokenHash === 'string'
    ? value.tokenHash
    : typeof value.token_hash === 'string'
      ? value.token_hash
      : '';
  const email = value.email.trim();
  if (!email || !tokenHash) throw new Error('Demo sign-in returned an invalid session handoff.');

  return {
    email,
    tokenHash,
  };
}

async function getFunctionError(error: unknown) {
  if (isRecord(error) && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.json();
      if (isRecord(body) && typeof body.error === 'string' && body.error) return new Error(body.error);
    } catch {
      // Fall back to the SDK error below when the response is not JSON.
    }
  }
  return error instanceof Error ? error : new Error('Demo sign-in failed.');
}

function getDemoBrowserFingerprint() {
  try {
    const existing = sessionStorage.getItem(DEMO_FINGERPRINT_STORAGE_KEY);
    if (existing) return existing;

    const fingerprint = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(DEMO_FINGERPRINT_STORAGE_KEY, fingerprint);
    return fingerprint;
  } catch {
    return 'unavailable';
  }
}

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
  const hydrateSparringStore = useSparringStore((state) => state.hydrateSavedSessions);
  const prepareSparringStore = useSparringStore((state) => state.prepareForUser);
  const resetSessionStore = useSessionStore((state) => state.resetLocalData);
  const resetSettingsStore = useSettingsStore((state) => state.resetLocalData);
  const resetSparringStore = useSparringStore((state) => state.resetLocalData);
  const hydrateDebateStore = useDebateStore((state) => state.hydrate);
  const resetDebateStore = useDebateStore((state) => state.resetLocalData);
  const currentUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    let hydratedUserId: string | undefined;
    const hydrateStores = (userId?: string) => {
      if (!userId || hydratedUserId === userId) return;
      hydratedUserId = userId;
      prepareSparringStore(userId);
      Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
      Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
      Promise.resolve(hydrateSparringStore()).catch((err) => console.warn('[Auth] hydrateSparringStore failed:', err));
      Promise.resolve(hydrateDebateStore()).catch((err) => console.warn('[Auth] hydrateDebateStore failed:', err));
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
          setActiveAccessToken(oauthSession.access_token, oauthSession.user.id);
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
        setActiveAccessToken(data.session?.access_token ?? null, data.session?.user.id ?? null);
        setSession(data.session ?? null);
        currentUserIdRef.current = data.session?.user?.id;
        setJamUserId(data.session?.user?.id);
        if (data.session) {
          hydrateStores(data.session.user?.id);
        }
      } catch (err) {
        console.warn('[Auth] init failed:', err);
        if (!mounted) return;
        setActiveAccessToken(null);
        setSession(null);
        currentUserIdRef.current = undefined;
        setJamUserId(undefined);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[Auth] Event:', event, 'Provider Token:', newSession?.provider_token ? 'present' : 'null');

      const prevUserId = currentUserIdRef.current;
      const nextUserId = newSession?.user?.id;
      clearCrossfireDraftOnAuthChange(prevUserId, nextUserId);
      currentUserIdRef.current = nextUserId;
      setJamUserId(nextUserId);
      setActiveAccessToken(newSession?.access_token ?? null, newSession?.user.id ?? null);
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
        resetSettingsStore(!prevUserId);
        resetSparringStore();
        resetDebateStore();
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
        resetSparringStore();
        resetDebateStore();
      }

      hydrateStores(nextUserId);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateDebateStore, hydrateSessionStore, hydrateSettingsStore, hydrateSparringStore, prepareSparringStore, resetDebateStore, resetSessionStore, resetSettingsStore, resetSparringStore]);

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
    signInWithEmailOtp: async (email) => {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) throw new Error('Email is required.');

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    },
    verifyEmailOtp: async (email, token) => {
      const normalizedEmail = email.trim();
      const normalizedToken = token.trim();
      if (!normalizedEmail) throw new Error('Email is required.');
      if (!normalizedToken) throw new Error('Verification code is required.');

      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });
      if (error) throw error;
    },
    signInWithDemoCode: async (code) => {
      const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '');
      if (!normalizedCode) throw new Error('Demo code is required.');

      const { data, error } = await supabase.functions.invoke('demo-code-login', {
        body: {
          code: normalizedCode,
          browserFingerprint: getDemoBrowserFingerprint(),
        },
      });
      if (error) throw await getFunctionError(error);

      const handoff = parseDemoCodeHandoff(data);
      const { error: verificationError } = await supabase.auth.verifyOtp({
        token_hash: handoff.tokenHash,
        type: 'magiclink',
      });
      if (verificationError) throw verificationError;
    },
    signOut: async () => {
      await supabase.auth.signOut();
      clearCrossfireDraftOnAuthChange(session?.user?.id, undefined);
      resetSessionStore();
      resetSettingsStore();
      resetSparringStore();
    },
  }), [session, loading, resetSessionStore, resetSettingsStore, resetSparringStore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
