import { randomUUID } from "node:crypto";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, providerCalls, test } from "./fixtures";

// Feature map: the Billing entry in features/README.md. Signed, forged, and replayed Stripe
// webhooks are covered by e2e/full-stack/billing.spec.ts, which drive also runs.

test("bill-promo: an expired account is blocked, redeems a promo code, and gets AI access back", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  await admin.from("user_settings")
    .update({ subscription_tier: "expired", trial_ends_at: null, grace_period_ends_at: null, daily_limit_override: null })
    .eq("user_id", userId);
  const code = `VERIFY${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: promo, error } = await admin.from("promo_codes")
    .insert({ code, type: "free_month", config: { days: 30 }, max_redemptions: 1 }).select("id").single();
  if (error) throw error;
  const brainstorm = async () => {
    await page.goto("/app/brainstorm");
    await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
    await page.getByRole("button", { name: "Start brainstorming" }).click();
    // No Current Debate, so the motion check asks first; the paywall (or the run) follows it.
    await chooseForMotion(page, "once");
  };
  try {
    await brainstorm();
    await expect(page.getByRole("dialog").getByText("Free Trial Ended")).toBeVisible({ timeout: AI_TIMEOUT });
    await evidence.shot("01-blocked");
    expect((await providerCalls()).filter((call) => call.feature === "brainstorm")).toEqual([]);

    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await page.getByRole("button", { name: "Have a promo code?" }).click();
    await page.getByPlaceholder("Enter promo code").fill(code);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("Promo code applied!").first()).toBeVisible();
    await evidence.shot("02-promo-applied");
    const { data } = await admin.from("user_settings").select("subscription_tier").eq("user_id", userId).single();
    expect(data?.subscription_tier).toBe("pro");

    const response = aiResponse(page, "brainstorm");
    await brainstorm();
    const body = await response;
    expect((body.output.topFive as unknown[]).length).toBeGreaterThan(0);
    await evidence.shot("03-access-restored");
  } finally {
    await admin.from("promo_codes").delete().eq("id", promo.id);
  }
});

test("bill-discount: a discount code is claimed once, stays in the dialog, and goes to Checkout", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  // An ended trial, so Settings and the dialog both offer "Upgrade to Pro".
  await admin.from("user_settings")
    .update({ subscription_tier: "expired", trial_ends_at: null, grace_period_ends_at: null, daily_limit_override: null })
    .eq("user_id", userId);
  const code = `VERIFYD${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: promo, error } = await admin.from("promo_codes")
    .insert({ code, type: "discount", config: { stripe_promotion_code: "promo_VerifyRecipe" }, max_redemptions: 1 })
    .select("id").single();
  if (error) throw error;
  const claims = async () => {
    const [{ data: row }, { count }] = await Promise.all([
      admin.from("promo_codes").select("redemptions_count").eq("id", promo.id).single(),
      admin.from("user_promos").select("id", { count: "exact", head: true }).eq("promo_code_id", promo.id).eq("user_id", userId),
    ]);
    return { redemptions: row?.redemptions_count, held: count };
  };
  // Stripe Checkout is out of reach locally; record what the dialog sends instead.
  const checkoutBodies: unknown[] = [];
  await page.route("**/functions/v1/create-checkout", async (route) => {
    checkoutBodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, json: { error: "Invalid or expired promo code", code: "promo_invalid" } });
  });
  try {
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Have a promo code?" }).click();
    await dialog.getByPlaceholder("Enter promo code").fill(code);
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("Discount code saved! It will be applied when you upgrade.").first()).toBeVisible();
    await expect(dialog.getByPlaceholder("Enter promo code")).toHaveValue(code);
    await evidence.shot("01-discount-saved");
    expect(await claims()).toEqual({ redemptions: 1, held: 1 });

    // Applying again is not a second claim.
    const again = page.waitForResponse((response) => response.url().includes("/functions/v1/redeem-promo"));
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    expect(await (await again).json()).toMatchObject({ success: true, code: "promo_discount_noted" });
    expect(await claims()).toEqual({ redemptions: 1, held: 1 });

    await dialog.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect.poll(() => checkoutBodies.length).toBe(1);
    expect(checkoutBodies[0]).toMatchObject({ promoCode: code });
    await evidence.shot("02-checkout-sent-code");
  } finally {
    await page.unroute("**/functions/v1/create-checkout");
    await admin.from("user_promos").delete().eq("promo_code_id", promo.id);
    await admin.from("promo_codes").delete().eq("id", promo.id);
  }
});
