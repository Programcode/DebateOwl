import { FunctionsFetchError, isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

const TOO_MANY_ATTEMPTS = 'mobile.signIn.errors.tooManyAttempts';
const NETWORK = 'mobile.signIn.errors.network';

// The `error` strings demo-code-login answers with (supabase/functions/demo-code-login/index.ts).
const DEMO_CODE_ERRORS = new Map([
  ['Too many attempts. Try again later.', TOO_MANY_ATTEMPTS],
  ['Enter a valid demo code.', 'login.invalidDemoCode'],
  ['Demo code not found.', 'mobile.signIn.errors.demoCodeNotFound'],
  ['This demo code has been disabled.', 'mobile.signIn.errors.demoCodeDisabled'],
  ['This demo code has expired.', 'mobile.signIn.errors.demoCodeExpired'],
  ['This demo code has no uses left.', 'mobile.signIn.errors.demoCodeUsedUp'],
  ['This demo code cannot be used.', 'mobile.signIn.errors.demoCodeUnavailable'],
]);

// Supabase Auth error codes for sending and verifying a code.
const AUTH_ERRORS = new Map([
  ['otp_expired', 'mobile.signIn.errors.codeInvalidOrExpired'],
  ['over_email_send_rate_limit', TOO_MANY_ATTEMPTS],
  ['over_request_rate_limit', TOO_MANY_ATTEMPTS],
  ['email_address_invalid', 'login.invalidEmail'],
]);

/**
 * The translation key for a sign-in failure. Server messages are English, so
 * known failures map to their own keys and anything else gets `fallback`, with
 * the raw message logged.
 */
export function signInErrorKey(error: unknown, fallback: string): string {
  if (error instanceof FunctionsFetchError || isAuthRetryableFetchError(error)) return NETWORK;
  if (isAuthApiError(error)) {
    const key = (error.code ? AUTH_ERRORS.get(error.code) : undefined) ?? (error.status === 429 ? TOO_MANY_ATTEMPTS : undefined);
    if (key) return key;
  } else if (error instanceof Error) {
    const key = DEMO_CODE_ERRORS.get(error.message);
    if (key) return key;
  }
  console.warn('Sign-in failed:', error instanceof Error ? error.message : error);
  return fallback;
}
