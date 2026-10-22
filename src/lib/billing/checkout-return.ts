import type { SubscriptionTier } from '@/hooks/use-subscription';

/** How long Settings keeps asking after Stripe redirects back. */
export const CHECKOUT_CONFIRM_WINDOW_MS = 20_000;
export const CHECKOUT_CONFIRM_INTERVAL_MS = 2_000;

export type CheckoutReturnAction = 'ignore' | 'wait' | 'poll' | 'confirmed' | 'slow' | 'canceled';

/**
 * What Settings should do with `?checkout=` after Stripe.
 * The first subscription read often lands before the webhook, and that read
 * stays fresh for a minute, so a successful payment can look expired.
 */
export function nextCheckoutConfirmation(input: {
  checkout: string | null;
  tier: SubscriptionTier;
  elapsedMs: number;
  loading: boolean;
}): CheckoutReturnAction {
  if (input.checkout === 'canceled') return 'canceled';
  if (input.checkout !== 'success') return 'ignore';
  if (input.loading) return 'wait';
  if (input.tier === 'pro' || input.tier === 'legacy_free') return 'confirmed';
  if (input.elapsedMs >= CHECKOUT_CONFIRM_WINDOW_MS) return 'slow';
  return 'poll';
}

export function stripCheckoutParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('checkout');
  next.delete('session_id');
  return next;
}
