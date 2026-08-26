import { createClient as realCreateClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export type { SupabaseClient, User };

type CreateClient = typeof realCreateClient;

declare global {
  // Handler-boundary tests set this before dynamically importing an Edge
  // Function entrypoint. Normal tests and production-like module imports fall
  // back to the real installed Supabase client implementation.
  // eslint-disable-next-line no-var
  var __edgeSupabaseCreateClient: CreateClient | undefined;
}

export const createClient: CreateClient = ((...args: Parameters<CreateClient>) => {
  if (globalThis.__edgeSupabaseCreateClient) {
    return globalThis.__edgeSupabaseCreateClient(...args);
  }
  return realCreateClient(...args);
}) as CreateClient;
