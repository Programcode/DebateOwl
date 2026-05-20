/**
 * Runtime environment resolver for Supabase.
 * Reads localStorage to determine whether to use prod or staging credentials.
 * Only admin users should toggle this via the Settings → Developer panel.
 */

export type SupabaseEnv = 'production' | 'staging';

const STORAGE_KEY = 'debate-supabase-env';

const ENVS: Record<SupabaseEnv, { url: string; anonKey: string }> = {
  production: {
    url: 'https://uziwdtkzofptihahfooo.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6aXdkdGt6b2ZwdGloYWhmb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDM0MzAsImV4cCI6MjA4NTI3OTQzMH0.caJvRcwlc5w_xGO_HpYxDobmibLbboa_kB2M1IjO3jw',
  },
  staging: {
    url: 'https://brifeyypjauyusmkptkx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyaWZleXlwamF1eXVzbWtwdGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTI5NjEsImV4cCI6MjA5NDgyODk2MX0.xKYcvponjw5b_ouPhJDnSBBB1CUSw1Jpz35zGiMmH6A',
  },
};

export function getActiveEnv(): SupabaseEnv {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'staging') return 'staging';
  } catch { /* SSR or restricted storage */ }
  return 'production';
}

export function setActiveEnv(env: SupabaseEnv): void {
  if (env === 'production') {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, env);
  }
}

const active = getActiveEnv();

export const SUPABASE_URL = ENVS[active].url;
export const SUPABASE_ANON_KEY = ENVS[active].anonKey;
export const IS_STAGING = active === 'staging';
