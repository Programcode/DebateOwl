import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { getActiveEnv } from './env';

// Beside the session itself (client.ts's AUTH_STORAGE_KEY), per project.
const EXPIRED_FLAG_KEY = `debate-auth-${getActiveEnv()}-expired`;
// After the server accepts a refresh, later refusals in the same burst are the
// old token's requests landing late. Don't refresh again for each of them.
const RECHECK_AFTER_MS = 10_000;

type SessionAuth = {
  refreshSession: () => Promise<{ error: unknown }>;
  signOut: (options: { scope: 'local' }) => Promise<unknown>;
};

/**
 * Whether a failed forced refresh means the session is gone for good (revoked,
 * deleted account, reset password) rather than Auth being unreachable. Network
 * failures, 5xx and rate limits keep the session: that is an outage.
 */
export function refreshMeansRevoked(error: unknown): boolean {
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return false;
  if (isAuthSessionMissingError(error)) return true;
  if (isAuthApiError(error)) return error.status >= 400 && error.status < 500 && error.status !== 429;
  return false;
}

let checking = false;
let confirmedAt = Number.NEGATIVE_INFINITY;

/**
 * A request was refused for auth. Ask Auth for a new token: if it refuses that
 * too, the session is dead, so sign this browser out and leave a note for the
 * login page. Run it outside any supabase-js request (client.ts queues it).
 */
export async function verifySessionAfterRejection(auth: SessionAuth, now: () => number = Date.now): Promise<'kept' | 'expired' | 'skipped'> {
  if (checking || now() - confirmedAt < RECHECK_AFTER_MS) return 'skipped';
  checking = true;
  try {
    const { error } = await auth.refreshSession();
    if (!error) confirmedAt = now();
    if (!refreshMeansRevoked(error)) return 'kept';
    markSessionExpired();
    // Local scope: the server already dropped this session, and other devices are not ours to sign out.
    await auth.signOut({ scope: 'local' });
    return 'expired';
  } catch (error) {
    console.warn('[Auth] Session check after a refused request failed:', error);
    return 'kept';
  } finally {
    checking = false;
  }
}

/** Test hook: forget the last confirmed refresh. */
export function resetSessionExpiryCheck(): void {
  checking = false;
  confirmedAt = Number.NEGATIVE_INFINITY;
}

function markSessionExpired(): void {
  try {
    sessionStorage.setItem(EXPIRED_FLAG_KEY, '1');
  } catch {
    // Storage blocked: the login page just won't say why.
  }
}

/** Whether this tab was signed out because the server refused its session. */
export function sessionExpiredNotice(): boolean {
  try {
    return sessionStorage.getItem(EXPIRED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSessionExpiredNotice(): void {
  try {
    sessionStorage.removeItem(EXPIRED_FLAG_KEY);
  } catch {
    // Nothing to clear.
  }
}
