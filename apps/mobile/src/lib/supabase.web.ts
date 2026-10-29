import { createClient } from '@supabase/supabase-js';

import { sessionStorage } from './device-storage';
import { watchSessionRemoval } from './session-expiry';
import { sessionStorageKey, supabaseProject } from './supabase-config';

// In a browser supabase-js refreshes on tab visibility by itself.
export const supabase = createClient(supabaseProject.url, supabaseProject.anonKey, {
  auth: {
    // A session the server ends is told apart from a sign-out here (session-expiry.ts).
    storage: watchSessionRemoval(sessionStorage, sessionStorageKey),
    storageKey: sessionStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
