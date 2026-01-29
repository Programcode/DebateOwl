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
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      if (data.session) {
        void hydrateSessionStore();
        void hydrateSettingsStore();
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const prevUserId = session?.user?.id;
      const nextUserId = newSession?.user?.id;
      setSession(newSession);
      setLoading(false);

      if (!nextUserId) {
        resetSessionStore();
        resetSettingsStore();
        return;
      }

      if (prevUserId && prevUserId !== nextUserId) {
        resetSessionStore();
        resetSettingsStore();
      }

      void hydrateSessionStore();
      void hydrateSettingsStore();
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
          redirectTo: window.location.origin,
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
