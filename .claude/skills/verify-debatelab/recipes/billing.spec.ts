import { randomUUID } from "node:crypto";
import { admin, AI_TIMEOUT, aiResponse, expect, providerCalls, test } from "./fixtures";

// Feature map: features/billing.md. Signed, forged, and replayed Stripe
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
    await page.getByRole("button", { name: "Start Brainstorming" }).click();
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
