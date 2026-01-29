import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uziwdtkzofptihahfooo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FCOjs726U466nD8jmv-HZw_DUYqSz-6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
