import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { getActiveEnv, SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export { SUPABASE_URL };

/** Where supabase-js keeps this project's session; each project has its own. */
export const AUTH_STORAGE_KEY = `debate-auth-${getActiveEnv()}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // AuthProvider owns the one PKCE exchange and URL cleanup path.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: AUTH_STORAGE_KEY,
  },
});

let activeAccessToken: string | null = null;
let activeUserId: string | null = null;

export function setActiveAccessToken(accessToken: string | null, userId: string | null = null): void {
  activeAccessToken = accessToken;
  activeUserId = userId;
}

export function getActiveAccessToken(): string | null {
  return activeAccessToken;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

type AuthenticatedFunctionResult<T> =
  | { data: T; error: null }
  | { data: null; error: FunctionsFetchError | FunctionsHttpError | FunctionsRelayError };

type AuthenticatedFunctionOptions = { body: Record<string, unknown>; headers: Record<string, string>; signal?: AbortSignal };

export async function invokeAuthenticatedFunction<T = unknown>(
  functionName: string,
  options: AuthenticatedFunctionOptions,
): Promise<AuthenticatedFunctionResult<T>> {
  return await invokeAuthenticatedFunctionWith<T>(functionName, options, async (response) => await response.json() as T);
}

/**
 * Like invokeAuthenticatedFunction, but a successful response is handed to
 * `read` instead of being parsed as JSON. Live generation reads an event
 * stream this way; failures keep the same error types.
 */
export async function invokeAuthenticatedFunctionWith<T>(
  functionName: string,
  options: AuthenticatedFunctionOptions,
  read: (response: Response) => Promise<T | AuthenticatedFunctionResult<T>['error']>,
): Promise<AuthenticatedFunctionResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { data: null, error: new FunctionsFetchError(error) };
  }

  if (response.headers.get('x-relay-error') === 'true') {
    return { data: null, error: new FunctionsRelayError(response) };
  }
  if (!response.ok) return { data: null, error: new FunctionsHttpError(response) };

  const data = await read(response);
  if (data instanceof FunctionsFetchError || data instanceof FunctionsHttpError || data instanceof FunctionsRelayError) {
    return { data: null, error: data };
  }
  return { data: data as T, error: null };
}
