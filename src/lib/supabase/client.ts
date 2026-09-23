import {
  createClient,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
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

let activeAccessToken: string | null = null;

export function setActiveAccessToken(accessToken: string | null): void {
  activeAccessToken = accessToken;
}

export function getActiveAccessToken(): string | null {
  return activeAccessToken;
}

type AuthenticatedFunctionResult<T> =
  | { data: T; error: null }
  | { data: null; error: FunctionsHttpError | FunctionsRelayError };

export async function invokeAuthenticatedFunction<T = unknown>(
  functionName: string,
  options: { body: Record<string, unknown>; headers: Record<string, string>; signal?: AbortSignal },
): Promise<AuthenticatedFunctionResult<T>> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.headers.get('x-relay-error') === 'true') {
    return { data: null, error: new FunctionsRelayError(response) };
  }
  if (!response.ok) return { data: null, error: new FunctionsHttpError(response) };

  const data: T = await response.json();
  return { data, error: null };
}
