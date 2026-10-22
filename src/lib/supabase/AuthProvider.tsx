/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, setActiveAccessToken, supabase } from './client';
import { allowSessionsAfterSignIn, rejectDeadSession, restoredSessionsBlocked } from './session-expiry';
import { AuthContext, useAuth, type AuthContextValue } from './auth-context';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useDebateStore } from '@/lib/stores/debate-store';
import { useDebateContextStore } from '@/lib/stores/debate-context-store';
import { openExternalUrl } from '@/lib/native';
import {
  AUTH_CALLBACK_PATH,
  authCallbackErrorFor,
  authCallbackUrl,
  readAuthCallbackParams,
  withoutCallbackParams,
  type AuthCallbackError,
} from '@/lib/auth-callback';
import { setJamUserId } from '@/lib/jam-metadata';
import { clearCrossfireDraftOnAuthChange } from '@/lib/crossfire/storage';
import { abortToolRuns } from '@/components/features/tools/tool-run';

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

function isDeadUserLookup(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403;
}

function clearGoogleTokens() {
  sessionStorage.removeItem('google_provider_token');
  localStorage.removeItem('google_provider_token');
  // Remove refresh tokens written by older clients as well; this client
  // never persists them because they are long-lived credentials.
  localStorage.removeItem('google_provider_refresh_token');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [callbackError, setCallbackError] = useState<AuthCallbackError | null>(null);
  const hydrateSessionStore = useSessionStore((state) => state.hydrateFromServer);
  const prepareSessionStore = useSessionStore((state) => state.prepareForUser);
  const hydrateSettingsStore = useSettingsStore((state) => state.hydrateFromServer);
  const prepareSettingsStore = useSettingsStore((state) => state.prepareForUser);
  const hydrateSparringStore = useSparringStore((state) => state.hydrateSavedSessions);
  const prepareSparringStore = useSparringStore((state) => state.prepareForUser);
  const prepareDebateStore = useDebateStore((state) => state.prepareForUser);
  const resetSessionData = useSessionStore((state) => state.resetLocalData);
  // A tool still writing for the previous account stops with its data.
  const resetSessionStore = useCallback(() => {
    abortToolRuns();
    resetSessionData();
  }, [resetSessionData]);
  const clearSessionStore = useSessionStore((state) => state.clearSession);
  const resetSettingsStore = useSettingsStore((state) => state.resetLocalData);
  const resetSparringStore = useSparringStore((state) => state.resetLocalData);
  const hydrateDebateStore = useDebateStore((state) => state.hydrate);
  const resetDebateStore = useDebateStore((state) => state.resetLocalData);
  const currentUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    let hydratedUserId: string | undefined;
    const confirmations = new Map<string, Promise<boolean>>();
    const confirmRestoredSession = (accessToken: string): Promise<boolean> => {
      const cached = confirmations.get(accessToken);
      if (cached) return cached;
      const pending = (async () => {
        if (restoredSessionsBlocked()) return false;
        if (typeof supabase.auth.getUser !== 'function') return true;
        try {
          const { error } = await supabase.auth.getUser();
          if (!isDeadUserLookup(error)) return true;
          await rejectDeadSession(supabase.auth);
          return false;
        } catch {
          // Auth did not answer. Keep the local session; this is an outage, not a dead login.
          return true;
        }
      })();
      confirmations.set(accessToken, pending);
      return pending;
    };
    const dropRestoredSession = () => {
      setActiveAccessToken(null);
      setSession(null);
      currentUserIdRef.current = undefined;
      setJamUserId(undefined);
    };
    const hydrateStores = (userId?: string) => {
      if (!userId || hydratedUserId === userId) return;
      hydratedUserId = userId;
      // Bind before any paint of protected pages. A full-page sign-in (magic
      // link, Google) never sees the previous account's in-tab sign-out, so
      // the persisted snapshot has to be checked against this user here.
      prepareSessionStore(userId);
      prepareSettingsStore(userId);
      prepareSparringStore(userId);
      prepareDebateStore(userId);
      Promise.resolve(hydrateSessionStore()).catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
      Promise.resolve(hydrateSettingsStore()).catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
      Promise.resolve(hydrateSparringStore()).catch((err) => console.warn('[Auth] hydrateSparringStore failed:', err));
      Promise.resolve(hydrateDebateStore()).catch((err) => console.warn('[Auth] hydrateDebateStore failed:', err));
    };

    // Older clients persisted these credentials across browser sessions.
    localStorage.removeItem('google_provider_token');
    localStorage.removeItem('google_provider_refresh_token');

    // Set before the first await: auth-js announces the empty stored session
    // while the code is still being exchanged, and that must not end loading.
    const callbackUrl = new URL(window.location.href);
    let callbackPending = callbackUrl.pathname === AUTH_CALLBACK_PATH;

    const hydrateOAuthCallbackSession = async (): Promise<Session | null> => {
      if (!callbackPending) return null;
      const { code, flowId, error } = readAuthCallbackParams(callbackUrl);
      window.history.replaceState(window.history.state, '', withoutCallbackParams(callbackUrl));
      if (error) {
        setCallbackError(error);
        return null;
      }
      if (!code) return null;

      // Finishing a sign-in is as explicit as pressing a sign-in button.
      allowSessionsAfterSignIn();
      try {
        // The flow id picks this sign-in's own verifier, so another tab's
        // sign-in or a failed resend can't break the link.
        const { data, error: exchangeError } = await withAuthTimeout(
          supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined),
          'OAuth code exchange timeout',
          OAUTH_CODE_EXCHANGE_TIMEOUT_MS,
        );
        if (exchangeError) throw exchangeError;
        return data.session;
      } catch (err) {
        // A session this browser already had still stands; getSession restores it below.
        console.warn('[Auth] sign-in callback failed:', err);
        if (mounted) setCallbackError(authCallbackErrorFor(err));
        return null;
      }
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
        if (data.session?.access_token && !(await confirmRestoredSession(data.session.access_token))) {
          if (!mounted) return;
          dropRestoredSession();
          return;
        }
        if (!mounted) return;
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
        callbackPending = false;
        if (mounted) setLoading(false);
      }
    };

    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (import.meta.env.DEV) console.log('[Auth] Event:', event, 'Provider Token:', newSession?.provider_token ? 'present' : 'null');

      if (newSession && restoredSessionsBlocked()) {
        dropRestoredSession();
        setLoading(false);
        return;
      }

      const prevUserId = currentUserIdRef.current;
      const nextUserId = newSession?.user?.id;
      clearCrossfireDraftOnAuthChange(prevUserId, nextUserId);
      currentUserIdRef.current = nextUserId;
      setJamUserId(nextUserId);
      setActiveAccessToken(newSession?.access_token ?? null, newSession?.user.id ?? null);
      setSession(newSession);
      if (event === 'SIGNED_IN') setCallbackError(null);

      // Provider access tokens are short-lived. Keep them only for this browser
      // session; a later export must reauthorize if no fresh token is available.
      if (newSession?.provider_token) {
        if (import.meta.env.DEV) console.log('[Auth] Storing new provider_token');
        sessionStorage.setItem('google_provider_token', newSession.provider_token);
      }

      if (!nextUserId) {
        hydratedUserId = undefined;
        resetSessionStore();
        resetSettingsStore(!prevUserId);
        resetSparringStore();
        resetDebateStore();
        useDebateContextStore.getState().resetLocalData();
        clearGoogleTokens();
        if (!callbackPending) setLoading(false);
        return;
      }

      if (prevUserId && prevUserId !== nextUserId) {
        hydratedUserId = undefined;
        resetSessionStore();
        resetSettingsStore();
        resetSparringStore();
        resetDebateStore();
        useDebateContextStore.getState().resetLocalData();
      }

      if (newSession?.access_token) {
        void confirmRestoredSession(newSession.access_token).then((alive) => {
          if (!mounted || !alive || restoredSessionsBlocked()) {
            if (mounted && !alive) dropRestoredSession();
            return;
          }
          hydrateStores(newSession.user?.id);
        });
      } else {
        hydrateStores(nextUserId);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateDebateStore, hydrateSessionStore, hydrateSettingsStore, hydrateSparringStore, prepareDebateStore, prepareSessionStore, prepareSettingsStore, prepareSparringStore, resetDebateStore, resetSessionStore, resetSettingsStore, resetSparringStore]);

  // sessionStorage holds this tab's Google token and sparring state.
  const discardTabState = useCallback(() => {
    clearGoogleTokens();
    resetSparringStore();
  }, [resetSparringStore]);

  // The persisted stores are shared by both projects. Drop this project's
  // stored session and clear every user-specific store so nothing crosses.
  const discardLocalState = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(`${AUTH_STORAGE_KEY}-user`);
    discardTabState();
    clearCrossfireDraftOnAuthChange(session?.user?.id, undefined);
    resetSessionStore();
    clearSessionStore();
    resetSettingsStore(true);
    resetDebateStore();
    useDebateContextStore.getState().resetLocalData();
  }, [session, clearSessionStore, discardTabState, resetDebateStore, resetSessionStore, resetSettingsStore]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    callbackError,
    clearCallbackError: () => setCallbackError(null),
    signInWithGoogle: async ({ driveAccess = false, next } = {}) => {
      allowSessionsAfterSignIn();
      // Always use the SDK-generated URL so PKCE's code_verifier is written
      // to storage before redirect. The previous Promise.race against a 1200ms
      // timeout could fall back to a hand-built URL that skipped PKCE — Google
      // would then call back to /app but the SDK couldn't exchange the code,
      // leaving the user stuck on "Redirecting…" until manual refresh.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authCallbackUrl(window.location.origin, next),
          skipBrowserRedirect: true,
          ...(driveAccess ? { scopes: 'https://www.googleapis.com/auth/drive.file' } : {}),
          queryParams: undefined,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('Google sign-in could not start. Please try again.');

      await openExternalUrl(data.url);
    },
    signInWithEmailOtp: async (email, { next } = {}) => {
      allowSessionsAfterSignIn();
      const normalizedEmail = email.trim();
      if (!normalizedEmail) throw new Error('Email is required.');

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        // Prod's email also carries a link. It must open the callback, not the landing page.
        options: { shouldCreateUser: true, emailRedirectTo: authCallbackUrl(window.location.origin, next) },
      });
      if (error) throw error;
    },
    verifyEmailOtp: async (email, token) => {
      allowSessionsAfterSignIn();
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
      allowSessionsAfterSignIn();
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
      // Local scope: signing out here must not sign the account out on other devices.
      await supabase.auth.signOut({ scope: 'local' });
      clearCrossfireDraftOnAuthChange(session?.user?.id, undefined);
      resetSessionStore();
      resetSettingsStore();
      resetSparringStore();
    },
    leaveEnvironment: async () => {
      try {
        // Local scope: switching backends must not sign the account out on other devices.
        await withAuthTimeout(supabase.auth.signOut({ scope: 'local' }), 'Sign-out timed out');
      } catch (error) {
        console.warn('Sign-out before environment switch failed:', error);
      }
      // A hung sign-out never fires SIGNED_OUT, so clear local state directly.
      discardLocalState();
    },
    discardTabState,
  }), [session, loading, callbackError, discardLocalState, discardTabState, resetSessionStore, resetSettingsStore, resetSparringStore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { useAuth };
