import site from '@/config/site.json';
import type { BillingStateName, SubscriptionTier } from '@/hooks/use-subscription';

/** The trial length, from the same price config the landing page and SEO pages use. */
export const TRIAL_DAYS = site.pricing.trialDays;

/** Pro's monthly price from the price config, never typed into a translation. */
export const PRO_MONTHLY_PRICE = Number(site.pricing.proMonthly);

/** A plan price in the reader's number format: "$5" in English, "5 $" in Hungarian and Spanish. */
export function formatPlanPrice(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: site.pricing.currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/**
 * The one billing step an account's state calls for, wherever a plan button
 * shows (Settings, the pricing dialog):
 * - manage: a Stripe subscription can still bill, so the billing portal. A
 *   second Checkout would charge twice.
 * - setUpBilling: Pro without Stripe (a promo), so Checkout to keep it.
 * - resubscribe: a former subscriber, so Checkout again.
 * - upgrade: everyone else (trial, extended access, ended trial, legacy free).
 */
export type BillingAction = 'manage' | 'setUpBilling' | 'resubscribe' | 'upgrade';

export function billingAction({ billingState, hasOpenSubscription, hasStripeBilling }: {
  billingState: BillingStateName;
  hasOpenSubscription: boolean;
  hasStripeBilling: boolean;
}): BillingAction {
  const onPro = billingState === 'pro' || billingState === 'pro_canceling';
  if (hasOpenSubscription || (onPro && hasStripeBilling)) return 'manage';
  if (onPro) return 'setUpBilling';
  if (billingState === 'subscription_ended') return 'resubscribe';
  return 'upgrade';
}

/**
 * The plan the account is on now, for the pricing dialog's Current badge: Pro
 * includes a payment grace. Legacy free, extended access and ended plans are
 * on neither card, since each is offered Upgrade to Pro.
 */
export function currentPlan(tier: SubscriptionTier): 'trial' | 'pro' | null {
  if (tier === 'trial') return 'trial';
  if (tier === 'pro') return 'pro';
  return null;
}

export const BILLING_ACTION_LABELS: Record<BillingAction, string> = {
  manage: 'billing.manageSubscription',
  setUpBilling: 'billing.setUpBilling',
  resubscribe: 'billing.resubscribe',
  upgrade: 'billing.upgradeToPro',
};
