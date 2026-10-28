import { supabase } from './supabase';

/** One user's rows of a table, in the shape the shared billing reader takes (packages/core/src/supabase/billing.ts). */
export function billingQuery(userId: string) {
  return (table: string, columns: string) => supabase.from(table).select(columns).eq('user_id', userId);
}
