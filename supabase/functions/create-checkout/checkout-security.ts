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

export interface DiscountPromo {
  expires_at?: string | null;
  max_redemptions?: number | null;
  redemptions_count?: number | null;
}

/**
 * Why a discount promo cannot be used at Checkout, or null when it can. The
 * same checks redeem_promo_code_atomic applies to every other promo type:
 * the code's expiry and its redemption cap (QB-08).
 */
export function discountPromoRefusal(promo: DiscountPromo, now: Date = new Date()): "expired" | "exhausted" | null {
  const expires = promo.expires_at ? Date.parse(promo.expires_at) : Number.NaN;
  if (!Number.isNaN(expires) && expires < now.getTime()) return "expired";
  if (typeof promo.max_redemptions === "number" && (promo.redemptions_count ?? 0) >= promo.max_redemptions) return "exhausted";
  return null;
}
