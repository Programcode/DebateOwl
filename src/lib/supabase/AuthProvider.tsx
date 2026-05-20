/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hydrateSessionStore = useSessionStore((state) => state.hydrateFromServer);
  const hydrateSettingsStore = useSettingsStore((state) => state.hydrateFromServer);
  const resetSessionStore = useSessionStore((state) => state.resetLocalData);
  const resetSettingsStore = useSettingsStore((state) => state.resetLocalData);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // In some browser states (stalled locks, blocked storage, extensions),
        // getSession() can hang long enough to look like a frozen app. If it
        // doesn't resolve quickly, fail open to the login route and rely on
        // onAuthStateChange to populate the session when available.
        const getSessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 4000)),
        ]);

        if (!mounted) return;
        const { data, error } = getSessionResult;
        if (error) console.warn('[Auth] getSession error:', error.message);
        setSession(data.session ?? null);
        if (data.session) {
          hydrateSessionStore().catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
          hydrateSettingsStore().catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
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

      const prevUserId = session?.user?.id;
      const nextUserId = newSession?.user?.id;
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

      hydrateSessionStore().catch((err) => console.warn('[Auth] hydrateSessionStore failed:', err));
      hydrateSettingsStore().catch((err) => console.warn('[Auth] hydrateSettingsStore failed:', err));
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateSessionStore, hydrateSettingsStore, resetSessionStore, resetSettingsStore, session?.user?.id]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle: async () => {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app`,
          scopes: 'https://www.googleapis.com/auth/drive.file',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
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
