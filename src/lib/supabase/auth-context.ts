import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AuthCallbackError } from '@/lib/auth-callback';

// Kept apart from AuthProvider so public pages can read the signed-in user
// without importing the Supabase client, which needs a browser. The build
// prerenders those pages in Node (src/prerender/entry.tsx).

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Why the last sign-in callback (Google or an email link) did not sign anyone in. */
  callbackError: AuthCallbackError | null;
  clearCallbackError: () => void;
  /** `next` is the in-app page to open after the callback. */
  signInWithGoogle: (options?: { driveAccess?: boolean; next?: string }) => Promise<void>;
  signInWithEmailOtp: (email: string, options?: { next?: string }) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithDemoCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Ends the session and clears this project's local data before an environment switch. Never hangs. */
  leaveEnvironment: () => Promise<void>;
  /**
   * Clears only this tab's own storage (Google token, sparring state). For a tab
   * that reloads because another tab switched projects; it must not touch the
   * shared stores, which may already belong to the new project.
   */
  discardTabState: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
