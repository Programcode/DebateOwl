import { createClient } from '@supabase/supabase-js';
import { getActiveEnv, SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export { SUPABASE_URL };

// Supabase Auth uses Navigator Locks for cross-tab session coordination. In this
// app that lock can make click-to-login and OAuth callback handling wait for the
// SDK's full 10s timeout when a browser tab leaves behind a stale lock. Running
// auth work directly is a better tradeoff than making sign-in feel broken.
const runWithoutAuthLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
) => await fn();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: `debate-auth-${getActiveEnv()}`,
    lockAcquireTimeout: 1500,
    lock: runWithoutAuthLock,
  },
});
