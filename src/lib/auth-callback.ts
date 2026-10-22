// Google and the emailed sign-in link both return here. AuthProvider exchanges
// the code; AuthCallbackPage waits for it and then opens `next` or /login.
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Why a callback did not sign anyone in. LoginPage shows a message for each. */
export type AuthCallbackError = 'link-expired' | 'other-browser' | 'failed';

export type AuthCallbackParams = {
  code: string | null;
  flowId: string | null;
  error: AuthCallbackError | null;
};

// Only in-app pages, as plain path segments: no other origin, scheme, `..` or query.
const NEXT_PATH = /^\/app(?:\/[A-Za-z0-9_-]+)*$/;
// auth-js's own shape for the `sb_flow_id` it appends to redirect URLs.
const FLOW_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const CALLBACK_PARAMS = ['code', 'state', 'error', 'error_code', 'error_description', 'sb_flow_id'];
// Before /auth/callback existed, links returned to / (email) or /app (Google).
const LEGACY_CALLBACK_PATHS = new Set(['/', '/app', '/app/']);

export function safeNextPath(value: string | null | undefined): string {
  return value && NEXT_PATH.test(value) ? value : '/app';
}

export function authCallbackUrl(origin: string, next?: string): string {
  const target = safeNextPath(next);
  const query = target === '/app' ? '' : `?${new URLSearchParams({ next: target })}`;
  return `${origin}${AUTH_CALLBACK_PATH}${query}`;
}

function hashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

/**
 * The callback route for a link that still points at / or /app (one already in
 * an inbox, or a Google sign-in started before a deploy). Null for any other URL.
 */
export function legacyCallbackPath(location: { pathname: string; search: string; hash: string }): string | null {
  if (!LEGACY_CALLBACK_PATHS.has(location.pathname)) return null;
  const query = new URLSearchParams(location.search);
  const fragment = hashParams(location.hash);
  const isCallback = ['code', 'error', 'error_code'].some((name) => query.has(name) || fragment.has(name));
  return isCallback ? `${AUTH_CALLBACK_PATH}${location.search}${location.hash}` : null;
}

function errorFromCode(code: string | null | undefined): AuthCallbackError {
  if (code === 'pkce_code_verifier_not_found') return 'other-browser';
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') return 'link-expired';
  return 'failed';
}

export function readAuthCallbackParams(url: URL): AuthCallbackParams {
  // PKCE errors come back in the query; implicit-flow errors in the fragment.
  const fragment = hashParams(url.hash);
  const read = (name: string) => url.searchParams.get(name) ?? fragment.get(name);
  const flowId = url.searchParams.get('sb_flow_id');
  const hasError = Boolean(read('error') || read('error_code'));
  return {
    code: url.searchParams.get('code'),
    flowId: flowId && FLOW_ID.test(flowId) ? flowId : null,
    error: hasError ? errorFromCode(read('error_code')) : null,
  };
}

export function authCallbackErrorFor(error: unknown): AuthCallbackError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return errorFromCode(typeof code === 'string' ? code : undefined);
}

/** The callback URL without the auth server's parameters. `next` stays. */
export function withoutCallbackParams(url: URL): string {
  const next = new URL(url.href);
  for (const name of CALLBACK_PARAMS) next.searchParams.delete(name);
  const fragment = hashParams(next.hash);
  const hash = fragment.has('error') || fragment.has('error_code') ? '' : next.hash;
  return `${next.pathname}${next.search}${hash}`;
}
