import { describe, expect, it } from "vitest";
import {
  discountPromotionCode,
  findCustomerOwnedByUser,
  hasOpenSubscription,
  isAllowedCheckoutRedirectUrl,
} from "../../supabase/functions/create-checkout/checkout-security";

describe("checkout security", () => {
  it("accepts only configured web callback origins", () => {
    expect(
      isAllowedCheckoutRedirectUrl(
        "https://debateowl.com/app/settings?checkout=success",
      ),
    ).toBe(true);
    expect(isAllowedCheckoutRedirectUrl("http://localhost:5173/app/settings")).toBe(true);
  });

  it("rejects arbitrary and lookalike checkout redirect origins", () => {
    expect(isAllowedCheckoutRedirectUrl("https://evil.example/after-payment")).toBe(false);
    expect(isAllowedCheckoutRedirectUrl("https://debateowl.com.evil.example/app")).toBe(false);
  });

  it("only reuses a Stripe customer whose metadata belongs to the authenticated user", () => {
    const customers = [
      { id: "cus_other", deleted: false, metadata: { user_id: "other-user" } },
      { id: "cus_correct", deleted: false, metadata: { user_id: "user-123" } },
    ];

    expect(findCustomerOwnedByUser(customers, "user-123")).toBe("cus_correct");
    expect(findCustomerOwnedByUser(customers, "missing-user")).toBeNull();
  });

  it("treats a subscription that can still bill as a reason to refuse another checkout", () => {
    expect(hasOpenSubscription([{ status: "active" }, { status: "canceled" }])).toBe(true);
    expect(hasOpenSubscription([{ status: "trialing" }])).toBe(true);
    expect(hasOpenSubscription([{ status: "past_due" }])).toBe(true);
    expect(hasOpenSubscription([{ status: "paused" }])).toBe(true);
    expect(hasOpenSubscription([{ status: "unpaid" }])).toBe(true);
    expect(hasOpenSubscription([{ status: "canceled" }, { status: "incomplete" }, { status: "incomplete_expired" }])).toBe(false);
    expect(hasOpenSubscription([])).toBe(false);
    expect(hasOpenSubscription(null)).toBe(false);
  });

  it("applies only the Stripe promotion code a successful discount claim returns", () => {
    const claim = { success: true, promoType: "discount", stripePromotionCode: "promo_1AbC" };
    expect(discountPromotionCode(claim)).toBe("promo_1AbC");
    expect(discountPromotionCode({ ...claim, success: false })).toBeNull();
    expect(discountPromotionCode({ ...claim, promoType: "free_month" })).toBeNull();
    expect(discountPromotionCode({ ...claim, stripePromotionCode: "coupon_50OFF" })).toBeNull();
    expect(discountPromotionCode({ ...claim, stripePromotionCode: "promo_1AbC&allow_promotion_codes=true" })).toBeNull();
    expect(discountPromotionCode({ success: false, code: "too_many_attempts" })).toBeNull();
    expect(discountPromotionCode(null)).toBeNull();
  });
});
