import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { sessionStorage } from './device-storage';
import { sessionStorageKey, supabaseProject } from './supabase-config';

export const supabase = createClient(supabaseProject.url, supabaseProject.anonKey, {
  auth: {
    storage: sessionStorage,
    storageKey: sessionStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground, as Supabase's React Native guide does.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

/** One user's rows of a table, in the shape the shared billing reader takes (packages/core/src/supabase/billing.ts). */
export function billingQuery(userId: string) {
  return (table: string, columns: string) => supabase.from(table).select(columns).eq('user_id', userId);
}
