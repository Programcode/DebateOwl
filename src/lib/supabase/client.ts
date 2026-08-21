import { createClient } from '@supabase/supabase-js';
import { getActiveEnv, SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export { SUPABASE_URL };

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // AuthProvider owns the one PKCE exchange and URL cleanup path.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: `debate-auth-${getActiveEnv()}`,
  },
});
