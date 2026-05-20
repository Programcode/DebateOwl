import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export { SUPABASE_URL };

// In some browsers/dev setups, the Navigator Lock API can be flaky and cause
// auth/session calls to fail with AbortError ("operation was aborted").
// Disabling auth locks in dev avoids local auth hangs without impacting prod.
const disableAuthLocks = import.meta.env.DEV;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(disableAuthLocks
      ? {
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => await fn(),
      }
      : {}),
  },
});
