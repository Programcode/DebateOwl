import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uziwdtkzofptihahfooo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6aXdkdGt6b2ZwdGloYWhmb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDM0MzAsImV4cCI6MjA4NTI3OTQzMH0.caJvRcwlc5w_xGO_HpYxDobmibLbboa_kB2M1IjO3jw';

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
