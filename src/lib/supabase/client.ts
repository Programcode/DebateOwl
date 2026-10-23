import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { e2eRefusesProductionRequest } from './e2e-guard';
import { getActiveEnv, SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { verifySessionAfterRejection } from './session-expiry';

export { SUPABASE_URL };

/** Where supabase-js keeps this project's session; each project has its own. */
export const AUTH_STORAGE_KEY = `debate-auth-${getActiveEnv()}`;

let activeAccessToken: string | null = null;
let activeUserId: string | null = null;

/**
 * Whether a Supabase answer says the server refused this browser's session.
 * A 403 from REST is a policy answer, not an auth one, so only Auth's own
 * user lookup counts 403. The token and logout endpoints are left out: the
 * check that follows a rejection calls them itself.
 */
export function isAuthRejection(url: string, status: number): boolean {
  let path: string;
  try {
    path = new URL(url, SUPABASE_URL).pathname;
  } catch {
    return false;
  }
  if (path === '/auth/v1/user') return status === 401 || status === 403;
  if (path.startsWith('/rest/v1/') || path.startsWith('/functions/v1/')) return status === 401;
  return false;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Reads that wait for the connection instead of failing. supabase-js retries a
 * failed read three more times, so offline every query became a burst of
 * requests. Writes still fail at once, so the UI can say nothing was saved.
 * Auth is left out: auth-js holds its session lock during a user lookup, and a
 * lookup held offline would block sign-out and every other request.
 */
function waitsForConnection(url: string, method: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  try {
    const path = new URL(url, SUPABASE_URL).pathname;
    return path.startsWith('/rest/v1/') || path.startsWith('/functions/v1/') || path.startsWith('/storage/v1/');
  } catch {
    return false;
  }
}

/** Resolves once the browser is online, or rejects when the request is aborted first. */
function untilOnline(signal?: AbortSignal | null): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const online = () => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      window.removeEventListener('online', online);
      reject(signal?.reason ?? new DOMException('The request was aborted.', 'AbortError'));
    };
    if (signal?.aborted) {
      aborted();
      return;
    }
    window.addEventListener('online', online, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

// A signed-in request the server refused may mean a revoked session. supabase-js
// holds its session lock while some of these requests run, so the check (which
// takes that lock) is queued for after the request instead of run inside it.
const watchedFetch: typeof fetch = async (input, init) => {
  if (e2eRefusesProductionRequest({
    allowProduction: import.meta.env.VITE_E2E_ALLOW_PROD === "1",
    e2e: import.meta.env.VITE_E2E === "1",
    url: requestUrl(input),
  })) {
    return new Response(JSON.stringify({ error: "e2e_refused_production" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (waitsForConnection(requestUrl(input), method)) await untilOnline(init?.signal ?? (input instanceof Request ? input.signal : undefined));
  const response = await globalThis.fetch(input, init);
  const url = requestUrl(input);
  if (activeAccessToken && isAuthRejection(url, response.status)) {
    let userLookup = false;
    try {
      userLookup = new URL(url, SUPABASE_URL).pathname === '/auth/v1/user';
    } catch {
      userLookup = false;
    }
    setTimeout(() => void verifySessionAfterRejection(supabase.auth, Date.now, { userLookup }), 0);
  }
  return response;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // AuthProvider owns the one PKCE exchange and URL cleanup path.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: AUTH_STORAGE_KEY,
    // Each sign-in keeps its own PKCE verifier and its redirect carries
    // `sb_flow_id`, so a second sign-in (another tab, a resend) can't
    // overwrite or delete the verifier an emailed link needs.
    experimental: { appendPkceFlowIdToRedirects: true },
  },
  global: { fetch: watchedFetch },
});

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
