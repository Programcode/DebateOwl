import { OPEN_SUBSCRIPTION_STATUSES } from "../_shared/billing-state.ts";

type StripeCustomerLike = {
  id: string;
  // The npm Stripe types mark a live customer's `deleted` as `void`, and a
  // removed customer's as `true`. Accept both.
  deleted?: boolean | void;
  metadata?: Record<string, string> | null;
};

const ALLOWED_CHECKOUT_CALLBACKS = new Set([
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
]);

function callbackOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export function isAllowedCheckoutRedirectUrl(value: string): boolean {
  try {
    return ALLOWED_CHECKOUT_CALLBACKS.has(callbackOrigin(new URL(value)));
  } catch {
    return false;
  }
}


/** True when this user already has a Stripe subscription that can still bill them. */
export function hasOpenSubscription(rows: Array<{ status?: string | null }> | null | undefined): boolean {
  return (rows ?? []).some((row) => typeof row.status === "string" && OPEN_SUBSCRIPTION_STATUSES.has(row.status));
}

export function findCustomerOwnedByUser(
  customers: StripeCustomerLike[],
  userId: string,
): string | null {
  return customers.find((customer) => customer.deleted !== true && customer.metadata?.user_id === userId)?.id ?? null;
}

/**
 * The Stripe promotion code a redeem_promo_code_atomic answer grants at
 * Checkout, or null when the answer is not a successful discount claim.
 */
export function discountPromotionCode(claim: unknown): string | null {
  if (!claim || typeof claim !== "object") return null;
  const { success, promoType, stripePromotionCode } = claim as Record<string, unknown>;
  if (success !== true || promoType !== "discount") return null;
  return typeof stripePromotionCode === "string" && /^promo_[A-Za-z0-9]+$/.test(stripePromotionCode)
    ? stripePromotionCode
    : null;
}
