import { createClient } from '@supabase/supabase-js';

import { sessionStorage } from './device-storage';
import { sessionStorageKey, supabaseProject } from './supabase-config';

// In a browser supabase-js refreshes on tab visibility by itself.
export const supabase = createClient(supabaseProject.url, supabaseProject.anonKey, {
  auth: {
    storage: sessionStorage,
    storageKey: sessionStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
