import { createClient } from '@supabase/supabase-js';
import { getActiveEnv, SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export { SUPABASE_URL };

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: `debate-auth-${getActiveEnv()}`,
  },
});
