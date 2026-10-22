import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { getActiveEnv } from './env';

// Beside the session itself (client.ts's AUTH_STORAGE_KEY), per project.
const EXPIRED_FLAG_KEY = `debate-auth-${getActiveEnv()}-expired`;
// After the server accepts a refresh, later refusals in the same burst are the
// old token's requests landing late. Don't refresh again for each of them.
const RECHECK_AFTER_MS = 10_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

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
let backoffMs = BACKOFF_START_MS;
let retryNotBefore = Number.NEGATIVE_INFINITY;
let dead = false;
let signingOut: Promise<void> | null = null;

/** A restored session was refused. Further SIGNED_IN events must not reload data. */
export function restoredSessionsBlocked(): boolean {
  return dead;
}

/** An explicit sign-in is a new session, so stop ignoring restores. */
export function allowSessionsAfterSignIn(): void {
  dead = false;
  backoffMs = BACKOFF_START_MS;
  retryNotBefore = Number.NEGATIVE_INFINITY;
}

/**
 * The server refused this browser's user. Sign out once, locally, and ignore
 * any session the client restores afterwards.
 */
export async function rejectDeadSession(auth: SessionAuth): Promise<void> {
  dead = true;
  if (signingOut) return signingOut;
  signingOut = (async () => {
    markSessionExpired();
    try {
      // Local scope: the server already dropped this session, and other devices are not ours to sign out.
      await auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('[Auth] Local sign-out after a refused session failed:', error);
    }
  })();
  return signingOut;
}

/**
 * A request was refused for auth. A 401/403 from Auth's own user lookup means
 * the session is already dead, so sign out without another refresh (a refresh
 * can succeed and keep the loop going). A REST 401 still gets one refresh.
 * Outages back off. They never retry on a fixed short interval.
 * Run it outside any supabase-js request (client.ts queues it).
 */
export async function verifySessionAfterRejection(
  auth: SessionAuth,
  now: () => number = Date.now,
  options?: { userLookup?: boolean },
): Promise<'kept' | 'expired' | 'skipped'> {
  if (dead) return 'expired';
  if (checking) return 'skipped';
  const clock = now();
  if (clock - confirmedAt < RECHECK_AFTER_MS || clock < retryNotBefore) return 'skipped';
  checking = true;
  try {
    if (options?.userLookup) {
      await rejectDeadSession(auth);
      return 'expired';
    }
    const { error } = await auth.refreshSession();
    if (!error) {
      confirmedAt = clock;
      backoffMs = BACKOFF_START_MS;
      retryNotBefore = Number.NEGATIVE_INFINITY;
      return 'kept';
    }
    if (!refreshMeansRevoked(error)) {
      retryNotBefore = clock + backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS);
      return 'kept';
    }
    await rejectDeadSession(auth);
    return 'expired';
  } catch (error) {
    console.warn('[Auth] Session check after a refused request failed:', error);
    retryNotBefore = clock + backoffMs;
    backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS);
    return 'kept';
  } finally {
    checking = false;
  }
}

/** Test hook: forget the last confirmed refresh. */
export function resetSessionExpiryCheck(): void {
  checking = false;
  confirmedAt = Number.NEGATIVE_INFINITY;
  backoffMs = BACKOFF_START_MS;
  retryNotBefore = Number.NEGATIVE_INFINITY;
  dead = false;
  signingOut = null;
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
