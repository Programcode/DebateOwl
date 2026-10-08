import { describe, expect, it } from "vitest";
import {
  findCustomerOwnedByUser,
  isAllowedCheckoutRedirectUrl,
} from "../../supabase/functions/create-checkout/checkout-security";

describe("checkout security", () => {
  it("accepts only configured web callback origins", () => {
    expect(
      isAllowedCheckoutRedirectUrl(
        "https://debate.pi-stack.org/app/settings?checkout=success",
      ),
    ).toBe(true);
    expect(isAllowedCheckoutRedirectUrl("http://localhost:5173/app/settings")).toBe(true);
  });

  it("rejects arbitrary and lookalike checkout redirect origins", () => {
    expect(isAllowedCheckoutRedirectUrl("https://evil.example/after-payment")).toBe(false);
    expect(isAllowedCheckoutRedirectUrl("https://debate.pi-stack.org.evil.example/app")).toBe(false);
  });

  it("only reuses a Stripe customer whose metadata belongs to the authenticated user", () => {
    const customers = [
      { id: "cus_other", deleted: false, metadata: { user_id: "other-user" } },
      { id: "cus_correct", deleted: false, metadata: { user_id: "user-123" } },
    ];

    expect(findCustomerOwnedByUser(customers, "user-123")).toBe("cus_correct");
    expect(findCustomerOwnedByUser(customers, "missing-user")).toBeNull();
  });
});
