import { createHmac, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin, chooseForMotion, expect, expectResult, fake, MARK, providerCall, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

// Matches STRIPE_WEBHOOK_SECRET in .superset/workspace-test.env.
const webhookSecret = "whsec_local-full-stack-test";

// Demo sign-in grants lifetime Pro and new accounts get a trial, so each test first removes both.
async function expireAccess(userId: string) {
  const { error } = await admin.from("user_settings")
    .update({ subscription_tier: "expired", trial_ends_at: null, grace_period_ends_at: null, daily_limit_override: null })
    .eq("user_id", userId);
  if (error) throw error;
}

async function tier(userId: string) {
  const { data } = await admin.from("user_settings").select("subscription_tier").eq("user_id", userId).single();
  return data?.subscription_tier;
}

async function brainstorm(page: Page) {
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await chooseForMotion(page, "once");
}

function sendWebhook(event: object, signature = true) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", signature ? webhookSecret : "whsec_forged").update(`${timestamp}.${payload}`).digest("hex");
  return fetch(`${process.env.LOCAL_SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${digest}` },
    body: payload,
  });
}

function subscriptionObject(subscriptionId: string, status: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: subscriptionId,
    object: "subscription",
    status,
    cancel_at_period_end: false,
    current_period_start: now,
    current_period_end: now + 30 * 86_400,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
  };
}

function subscriptionEvent(type: string, subscriptionId: string, status: string) {
  return {
    id: `evt_${randomUUID()}`,
    object: "event",
    type,
    data: { object: subscriptionObject(subscriptionId, status) },
  };
}

test("a promo code redeemed in Settings restores AI access", async ({ signedIn: page, user }) => {
  const userId = await user.userId();
  await expireAccess(userId);
  const code = `E2E${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: promo, error } = await admin.from("promo_codes")
    .insert({ code, type: "free_month", config: { days: 30 }, max_redemptions: 1 })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await brainstorm(page);
    await expect(page.getByRole("dialog").getByText("Free Trial Ended")).toBeVisible({ timeout: 30_000 });
    expect((await fake.requests()).filter((request) => request.feature === "brainstorm")).toEqual([]);

    await page.goto("/app/settings");
    await expect(page.getByText("Expired", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await page.getByRole("button", { name: "Have a promo code?" }).click();
    await page.getByPlaceholder("Enter promo code").fill(code.toLowerCase());
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText("Promo code applied!").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
    expect(await tier(userId)).toBe("pro");

    await brainstorm(page);
    await expectResult(page, `${MARK} idea 1`);
    await providerCall("brainstorm");
  } finally {
    await admin.from("promo_codes").delete().eq("id", promo.id);
  }
});

test("signed Stripe webhooks grant and revoke Pro, and forged ones change nothing", async ({ signedIn: page, user }) => {
  const userId = await user.userId();
  await expireAccess(userId);
  const subscriptionId = `sub_e2e_${randomUUID()}`;
  const now = Date.now();
  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    stripe_customer_id: `cus_e2e_${randomUUID()}`,
    stripe_subscription_id: subscriptionId,
    status: "incomplete",
    current_period_start: new Date(now).toISOString(),
    current_period_end: new Date(now + 30 * 86_400_000).toISOString(),
  });
  if (error) throw error;

  const activated = subscriptionEvent("customer.subscription.updated", subscriptionId, "active");
  const forged = await sendWebhook(activated, false);
  expect(forged.status).toBe(400);
  expect(await tier(userId)).toBe("expired");

  // The webhook applies Stripe's current state, which the fake Stripe holds.
  await fake.stripeSubscription(subscriptionObject(subscriptionId, "active"));
  const accepted = await sendWebhook(activated);
  expect(accepted.status).toBe(200);
  expect(await tier(userId)).toBe("pro");
  // Stripe retries deliveries, so a replayed event must be acknowledged, not reapplied.
  expect(await (await sendWebhook(activated)).json()).toMatchObject({ duplicate: true });

  await page.goto("/app/settings");
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toBeVisible();
  await expect(page.getByTestId("billing-date")).toContainText("Renews on");

  // A failed renewal keeps Pro while Stripe retries, and Settings asks for a
  // new payment method instead of selling a second subscription (QB-13).
  await fake.stripeSubscription(subscriptionObject(subscriptionId, "past_due"));
  const failed = await sendWebhook({
    id: `evt_${randomUUID()}`,
    object: "event",
    type: "invoice.payment_failed",
    data: { object: { id: `in_e2e_${randomUUID()}`, object: "invoice", subscription: subscriptionId } },
  });
  expect(failed.status).toBe(200);
  expect(await tier(userId)).toBe("pro");
  await page.reload();
  await expect(page.getByText("Payment failed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Pro access continues until/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Upgrade to Pro/ })).toHaveCount(0);

  await fake.stripeSubscription(subscriptionObject(subscriptionId, "canceled"));
  const canceled = await sendWebhook(subscriptionEvent("customer.subscription.deleted", subscriptionId, "canceled"));
  expect(canceled.status).toBe(200);
  expect(await tier(userId)).toBe("expired");
  // An older "active" update that Stripe delivers late must not revive the plan.
  const stale = await sendWebhook(subscriptionEvent("customer.subscription.updated", subscriptionId, "active"));
  expect(stale.status).toBe(200);
  expect(await tier(userId)).toBe("expired");
  const { data: row } = await admin.from("subscriptions").select("status").eq("stripe_subscription_id", subscriptionId).single();
  expect(row?.status).toBe("canceled");

  await page.reload();
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  // A former subscriber is told the subscription ended, not that a free trial did (QB-14).
  await expect(page.getByText(/Your Pro subscription ended on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resubscribe" })).toBeVisible();
});
