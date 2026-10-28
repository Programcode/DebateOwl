import { captureProductEvent } from '@/lib/observability';
import { getActiveUserId } from '@/lib/supabase/client';

/**
 * Activation events: sign-up, trial, paywall, first AI answer, welcome.
 * They go through captureProductEvent, so its closed schema and its env-key
 * gate apply. They carry no account id, email, or text; the once-per-account
 * guards keep the id in this browser's storage only.
 */

const ONCE_PREFIX = 'debatelab-activation:';
// An account made this recently is a new sign-up, not a returning sign-in.
// Email codes and Google can take a while between creating and confirming.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

type OnceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): OnceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Records `name` once per account in this browser. Returns whether it was sent.
 * Blocked storage sends nothing: a guard that cannot remember would send the
 * event on every page load and count one student many times.
 */
export function captureOncePerAccount(
  name: string,
  accountId: string | null | undefined,
  properties?: Record<string, unknown>,
  storage: OnceStorage | null = browserStorage(),
): boolean {
  if (!accountId || !storage) return false;
  const key = `${ONCE_PREFIX}${name}:${accountId}`;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
  } catch {
    return false;
  }
  captureProductEvent(name, properties);
  return true;
}

function signedInUserId(): string | null {
  // Some unit tests replace the client module and omit this export.
  try {
    return typeof getActiveUserId === 'function' ? getActiveUserId() : null;
  } catch {
    return null;
  }
}

/** The first answer an account gets from any tool. */
export function captureFirstAISuccess(tool: string): void {
  captureOncePerAccount('first_ai_success', signedInUserId(), { tool });
}

export interface ActivationUser {
  id: string;
  created_at?: string;
  app_metadata?: Record<string, unknown>;
}

export type SignupMethod = 'demo' | 'email' | 'google';

export function signupMethod(user: ActivationUser): SignupMethod | null {
  const metadata = user.app_metadata ?? {};
  if (metadata.demo_access_code_id) return 'demo';
  if (metadata.provider === 'google') return 'google';
  if (metadata.provider === 'email') return 'email';
  return null;
}

export function isNewAccount(user: ActivationUser, now = Date.now()): boolean {
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isFinite(created) && now - created >= 0 && now - created <= NEW_ACCOUNT_WINDOW_MS;
}

/** A first sign-in to an account created in the last day. Returns whether it was sent. */
export function captureSignupCompleted(user: ActivationUser, now = Date.now()): boolean {
  const method = signupMethod(user);
  if (!method || !isNewAccount(user, now)) return false;
  return captureOncePerAccount('signup_completed', user.id, { method });
}

/**
 * New accounts start on the trial (handle_new_user). An account that signed up
 * earlier is not counted when this code ships: only new accounts send it.
 */
export function captureTrialStarted(user: ActivationUser, tier: string, now = Date.now()): boolean {
  if (tier !== 'trial' || !isNewAccount(user, now)) return false;
  return captureOncePerAccount('trial_started', user.id);
}

/** The welcome closed (Got it, Esc, or the backdrop). */
export function captureWelcomeCompleted(accountId: string | null | undefined): void {
  captureOncePerAccount('welcome_completed', accountId);
}

export type PaywallReason =
  | 'limit_reached'
  | 'weekly_budget_reached'
  | 'trial_ended'
  | 'payment_failed'
  | 'subscription_ended'
  | 'model_restricted';

/** The limit or Pro-model dialog opened. Sent every time, not once. */
export function capturePaywallShown(reason: PaywallReason, tool: string): void {
  captureProductEvent('paywall_shown', { reason, tool });
}
