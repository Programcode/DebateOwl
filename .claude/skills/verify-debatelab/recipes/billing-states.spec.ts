import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, test } from "./fixtures";

// Feature map: the Billing entry in features/README.md. Each state is written
// straight into user_settings and subscriptions (what the Stripe webhook
// leaves behind), then Settings and an AI request must agree on it.

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

type State = {
  name: string;
  settings: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  badge: { en: string; hu: string };
  text: { en: RegExp; hu: RegExp };
  button: { en: string; hu: string };
};

const STATES: State[] = [
  {
    // QB-02: an override on an expired trial is a deliberate grant.
    name: "extended-access",
    settings: { subscription_tier: "trial", trial_ends_at: at(-1), daily_limit_override: 5 },
    badge: { en: "Extended access", hu: "Bővített hozzáférés" },
    text: { en: /Extended access is active: 5 AI uses a day/, hu: /Bővített hozzáférésed van: napi 5 MI-használat/ },
    button: { en: "Upgrade to Pro", hu: "Váltás Pro-ra" },
  },
  {
    // QB-15
    name: "pro-canceling",
    settings: { subscription_tier: "pro" },
    subscription: { status: "active", current_period_start: at(-10), current_period_end: at(20), cancel_at_period_end: true },
    badge: { en: "Pro", hu: "Pro" },
    text: { en: /Cancels on/, hu: /Lemondva, lejár:/ },
    button: { en: "Manage Subscription", hu: "Előfizetés kezelése" },
  },
  {
    // QB-13: the tier the old webhook wrote on the first failed invoice.
    name: "past-due-grace",
    settings: { subscription_tier: "expired" },
    subscription: { status: "past_due", current_period_start: at(-2), current_period_end: at(28) },
    badge: { en: "Payment failed", hu: "Sikertelen fizetés" },
    text: { en: /Pro access continues until/, hu: /a Pro-hozzáférésed megmarad eddig/ },
    button: { en: "Manage Subscription", hu: "Előfizetés kezelése" },
  },
  {
    // QB-14
    name: "subscription-ended",
    settings: { subscription_tier: "expired", trial_ends_at: at(-60) },
    subscription: { status: "canceled", current_period_start: at(-40), current_period_end: at(-10), ended_at: at(-10) },
    badge: { en: "Expired", hu: "Lejárt" },
    text: { en: /Your Pro subscription ended on/, hu: /A Pro-előfizetésed véget ért/ },
    button: { en: "Resubscribe", hu: "Újra előfizetek" },
  },
];

async function setState(userId: string, state: State) {
  await admin.from("subscriptions").delete().eq("user_id", userId);
  const { error } = await admin.from("user_settings").update({
    subscription_tier: "trial",
    trial_ends_at: null,
    grace_period_ends_at: null,
    daily_limit_override: null,
    ...state.settings,
  }).eq("user_id", userId);
  if (error) throw error;
  if (state.subscription) {
    const { error: subError } = await admin.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: `cus_verify_${randomUUID()}`,
      stripe_subscription_id: `sub_verify_${randomUUID()}`,
      ...state.subscription,
    });
    if (subError) throw subError;
  }
}

async function brainstorm(page: Page) {
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await chooseForMotion(page, "once");
}

test("bill-states: Settings and the AI functions agree on each billing state, in English and Hungarian", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  const viewport = page.viewportSize();

  for (const language of ["en", "hu"] as const) {
    await page.goto("/app/settings");
    if (language === "hu") {
      await page.getByLabel("Interface Language").click();
      await page.getByRole("option", { name: "Magyar" }).click();
      await expect(page.getByText("Előfizetés", { exact: true })).toBeVisible();
    }
    for (const state of STATES) {
      await setState(userId, state);
      await page.goto("/app/settings");
      const card = page.getByTestId("subscription-card");
      await expect(card.getByText(state.badge[language], { exact: true })).toBeVisible();
      await expect(card.getByText(state.text[language])).toBeVisible();
      await expect(card.getByRole("button", { name: state.button[language] })).toBeVisible();
      // QB-02: never "Expired · Your access has expired" beside a working plan.
      await expect(card.getByText(language === "en" ? "Your access has expired" : "A hozzáférésed lejárt", { exact: false })).toHaveCount(0);
      await evidence.shot(`${language}-${state.name}`);
      if (viewport && viewport.width > 360) {
        await page.setViewportSize({ width: 360, height: 780 });
        await evidence.shot(`${language}-${state.name}-360`);
        await page.setViewportSize(viewport);
      }
    }
  }
  await evidence.step("Each state shows its own badge, sentence and single button in EN and HU");

  // Back to English for the AI checks.
  await page.goto("/app/settings");
  await page.getByLabel("Felület nyelve").click();
  await page.getByRole("option", { name: "English" }).click();

  // QB-02: extended access really is served.
  await setState(userId, STATES[0]);
  const served = aiResponse(page, "brainstorm");
  await brainstorm(page);
  expect(((await served).output.topFive as unknown[]).length).toBeGreaterThan(0);
  await evidence.shot("ai-extended-access-served");

  // QB-13: past the grace, a past-due payer is refused with payment_failed and sent to Settings, not Checkout.
  await setState(userId, {
    ...STATES[2],
    subscription: { status: "past_due", current_period_start: at(-20), current_period_end: at(10) },
  });
  await brainstorm(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Payment Failed", { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(dialog.getByText(/free trial/i)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Upgrade to Pro/ })).toHaveCount(0);
  await evidence.shot("ai-payment-failed-refused");
  await dialog.getByRole("button", { name: "Update payment method" }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByText("Payment failed", { exact: true })).toBeVisible();
  await evidence.step("Extended access is served; a past-due payer after the grace gets Payment Failed and goes to Settings");
});
