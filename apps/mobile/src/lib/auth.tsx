import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getInstallId, sessionStorage } from './device-storage';
import { setCacheOwner } from './offline-cache';
import { setSessionOwner } from './session-memory';
import { supabase } from './supabase';
import { sessionStorageKey } from './supabase-config';

type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been read. */
  loading: boolean;
  /** True once supabase-js's first auth event has been handled. Offline that takes about 30 seconds. */
  settled: boolean;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithDemoCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Same contract as the website's AuthProvider: demo-code-login answers with a
// magic-link token hash that the client exchanges for a session.
function demoTokenHash(value: unknown): string {
  const tokenHash = isRecord(value) && value.type === 'magiclink'
    ? (typeof value.tokenHash === 'string' ? value.tokenHash : value.token_hash)
    : undefined;
  if (typeof tokenHash !== 'string' || !tokenHash) {
    throw new Error('Demo sign-in returned an invalid session handoff.');
  }
  return tokenHash;
}

/**
 * The session supabase-js kept in storage. Started offline with an expired
 * access token, supabase-js cannot refresh, keeps the session for a later
 * retry, and still reports INITIAL_SESSION as null. A rejected refresh token
 * removes the stored session, so anything still here is worth keeping.
 */
async function storedSession(): Promise<Session | null> {
  try {
    const raw = await sessionStorage.getItem(sessionStorageKey);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return isRecord(value) && typeof value.refresh_token === 'string' && isRecord(value.user)
      ? (value as unknown as Session)
      : null;
  } catch {
    return null;
  }
}

async function functionError(error: unknown): Promise<Error> {
  if (isRecord(error) && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.json();
      if (isRecord(body) && typeof body.error === 'string' && body.error) return new Error(body.error);
    } catch {
      // Not JSON: fall back to the SDK error.
    }
  }
  return error instanceof Error ? error : new Error('Demo sign-in failed.');
}

/** Signs out without throwing; returns what went wrong, if anything. */
async function signOutError(scope: 'global' | 'local'): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signOut({ scope });
    return error ? error.message : null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  // The session memory and the saved copies are cleared before an account
  // change renders, so no screen ever shows the previous account's work.
  const setSession = useCallback((next: Session | null) => {
    setSessionOwner(next?.user.id ?? null);
    setCacheOwner(next?.user.id ?? null);
    setSessionState(next);
  }, []);
  const [loading, setLoading] = useState(true);
  const [settled, setSettled] = useState(false);
  // Counts auth changes, so a storage read that lands after a newer change is dropped.
  const generation = useRef(0);

  useEffect(() => {
    // Offline, supabase-js retries the refresh for up to 30 seconds before its
    // first event, so start from storage instead of holding the splash screen.
    void storedSession().then((stored) => {
      if (generation.current !== 0) return;
      setSession(stored);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const current = ++generation.current;
      if (event === 'INITIAL_SESSION' && next === null) {
        // Offline cold start: stay signed in; the auto-refresh retries once the network is back.
        void storedSession().then((stored) => {
          if (current !== generation.current) return;
          setSession(stored);
          setLoading(false);
          setSettled(true);
        });
        return;
      }
      setSession(next);
      setLoading(false);
      setSettled(true);
    });
    return () => data.subscription.unsubscribe();
  }, [setSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    settled,
    signInWithEmailOtp: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    },
    verifyEmailOtp: async (email, token) => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
      if (error) throw error;
    },
    signInWithDemoCode: async (code) => {
      const { data, error } = await supabase.functions.invoke('demo-code-login', {
        body: { code, browserFingerprint: await getInstallId() },
      });
      if (error) throw await functionError(error);
      const { error: verificationError } = await supabase.auth.verifyOtp({
        token_hash: demoTokenHash(data),
        type: 'magiclink',
      });
      if (verificationError) throw verificationError;
    },
    signOut: async () => {
      // supabase-js loads the session before signing out. Offline with an
      // expired access token that refresh fails, and it returns the error
      // without removing the stored session. Signing out must still sign out
      // here, so the stored session is removed whatever the server said.
      const globalError = await signOutError('global');
      if (globalError) {
        console.warn('Sign-out on the server failed; signing out on this device only:', globalError);
        const localError = await signOutError('local');
        if (localError) console.warn('Local sign-out failed:', localError);
      }
      try {
        await sessionStorage.removeItem(sessionStorageKey);
      } catch (cause) {
        console.warn('Could not remove the stored session:', cause);
      }
      generation.current += 1;
      setSession(null);
      setLoading(false);
    },
  }), [session, loading, settled, setSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
