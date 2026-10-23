import type { TFunction } from 'i18next';
import { formatWait } from '@/lib/login-form';

// Server messages from the demo-code-login Edge Function, mapped to catalog keys.
const DEMO_CODE_MESSAGES: Record<string, string> = {
  'Demo code not found.': 'login.errors.demoNotFound',
  'Enter a valid demo code.': 'login.invalidDemoCode',
  'This demo code cannot be used.': 'login.errors.demoUnusable',
  'This demo code has been disabled.': 'login.errors.demoDisabled',
  'This demo code has expired.': 'login.errors.demoExpired',
  'This demo code has no uses left.': 'login.errors.demoUsedUp',
  'Too many attempts. Try again later.': 'login.errors.rateLimited',
};

// Supabase Auth error codes that a person can act on.
const AUTH_CODES: Record<string, string> = {
  over_email_send_rate_limit: 'login.errors.rateLimited',
  over_request_rate_limit: 'login.errors.rateLimited',
  // Auth answers otp_expired for a mistyped code too, so the message covers both.
  otp_expired: 'login.errors.codeExpired',
  email_address_invalid: 'login.invalidEmail',
  validation_failed: 'login.invalidEmail',
};

// Auth's max_frequency refusal: "For security purposes, you can only request this after 42 seconds."
const RETRY_AFTER = /\bafter (\d{1,5}) seconds?\b/i;

/**
 * Seconds Auth asked to wait before sending another email, when its refusal says so.
 * Null for any other error, and for limits that name no wait (the hourly email cap).
 */
export function authRetryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const { code, status } = error as Error & { code?: unknown; status?: unknown };
  if (status !== 429 && code !== 'over_email_send_rate_limit' && code !== 'over_request_rate_limit') return null;
  const match = RETRY_AFTER.exec(error.message);
  return match ? Number(match[1]) : null;
}

/**
 * Turns a sign-in failure into a message in the user's language. Unknown errors get the
 * caller's fallback instead of raw English from the backend.
 */
export function localizeAuthError(error: unknown, t: TFunction, fallbackKey: string, fallback: string): string {
  if (error instanceof Error) {
    const demoKey = DEMO_CODE_MESSAGES[error.message.trim()];
    if (demoKey) return t(demoKey, error.message);

    const wait = authRetryAfterSeconds(error);
    if (wait !== null) return t('login.errors.rateLimitedWait', { time: formatWait(wait) });

    const { code, status } = error as Error & { code?: unknown; status?: unknown };
    if (typeof code === 'string' && AUTH_CODES[code]) return t(AUTH_CODES[code]);
    if (status === 429) return t('login.errors.rateLimited');
    if (error.name === 'TypeError' || /failed to fetch|network/i.test(error.message)) return t('login.errors.network');
  }
  return t(fallbackKey, fallback);
}
