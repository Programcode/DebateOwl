import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_CONFIRM_WINDOW_MS,
  nextCheckoutConfirmation,
  stripCheckoutParams,
} from '@/lib/billing/checkout-return';

describe('checkout return', () => {
  it('keeps polling while Stripe has not recorded Pro yet', () => {
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'expired',
      elapsedMs: 0,
      loading: false,
    })).toBe('poll');
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'trial',
      elapsedMs: CHECKOUT_CONFIRM_WINDOW_MS - 1,
      loading: false,
    })).toBe('poll');
  });

  it('waits for the first read, then stops once Pro or a gifted plan is visible', () => {
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'expired',
      elapsedMs: 0,
      loading: true,
    })).toBe('wait');
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'pro',
      elapsedMs: 4_000,
      loading: false,
    })).toBe('confirmed');
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'legacy_free',
      elapsedMs: 4_000,
      loading: false,
    })).toBe('confirmed');
  });

  it('stops polling when the webhook is still quiet after the window', () => {
    expect(nextCheckoutConfirmation({
      checkout: 'success',
      tier: 'expired',
      elapsedMs: CHECKOUT_CONFIRM_WINDOW_MS,
      loading: false,
    })).toBe('slow');
  });

  it('treats a canceled checkout as its own ending and ignores other pages', () => {
    expect(nextCheckoutConfirmation({
      checkout: 'canceled',
      tier: 'trial',
      elapsedMs: 0,
      loading: false,
    })).toBe('canceled');
    expect(nextCheckoutConfirmation({
      checkout: null,
      tier: 'expired',
      elapsedMs: 0,
      loading: false,
    })).toBe('ignore');
  });

  it('removes the Stripe return params and leaves the rest', () => {
    const next = stripCheckoutParams(new URLSearchParams('checkout=success&session_id=cs_test&tab=account'));
    expect(next.toString()).toBe('tab=account');
  });
});
