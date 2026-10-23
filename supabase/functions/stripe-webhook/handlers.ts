// Stripe event handlers: sync a subscription's state into `subscriptions` and
// the account's plan into `user_settings`. index.ts verifies and claims the
// event; these run once per claimed event. They take their clients as
// arguments so tests can drive them with fixture events.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import type { Stripe } from "../_shared/stripe.ts";
import { accountPresence, type AccountPresence } from "./account-presence.ts";

export interface WebhookDeps {
  supabase: SupabaseClient;
  stripe: {
    subscriptions: {
      retrieve: (id: string) => Promise<Stripe.Subscription>;
      cancel: (id: string) => Promise<unknown>;
    };
  };
  now?: () => Date;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/**
 * A promo grant (free_month, lifetime_pro) lives in grace_period_ends_at. It is
 * worth keeping while it ends later than now: a Stripe subscription that
 * starts or ends in the meantime must not wipe it (QB-08).
 */
export function promoGrantActive(gracePeriodEndsAt: string | null | undefined, now: Date): boolean {
  if (!gracePeriodEndsAt) return false;
  const end = Date.parse(gracePeriodEndsAt);
  return !Number.isNaN(end) && end > now.getTime();
}

export function createWebhookHandlers({ supabase, stripe, now = () => new Date() }: WebhookDeps) {
  async function lookupAccount(userId: string): Promise<AccountPresence> {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : null;
    return accountPresence({
      user: data?.user ?? null,
      errorStatus: status,
      errorMessage: error?.message ?? null,
    });
  }

  async function cancelSubscriptionIfPresent(subscriptionId: string): Promise<void> {
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "resource_missing") return;
      throw error;
    }
  }

  /**
   * Marks the account Pro. grace_period_ends_at is left alone: a promo grant
   * that runs past this subscription keeps working after it ends, and a lapsed
   * one is ignored by the resolver anyway (billing-state.ts). Upsert (not
   * update) so a missing user_settings row doesn't silently no-op and leave a
   * paying user without entitlements.
   */
  async function grantPro(userId: string, failure: string) {
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userId,
      subscription_tier: "pro",
      updated_at: now().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      console.error(`[WEBHOOK] ${failure}:`, error);
      throw new Error(`${failure}: ${error.message}`);
    }
  }

  /**
   * Records when a run of failed payments began (on: true, kept if already
   * set) or that it is over (on: false). The past-due grace counts from it.
   * A database without 20261023020000 has no column: the grace then counts
   * from the period start, so a failed write is logged, never retried.
   */
  async function markPaymentFailure(subscriptionId: string, on: boolean) {
    const update = supabase.from("subscriptions")
      .update({ payment_failed_at: on ? now().toISOString() : null })
      .eq("stripe_subscription_id", subscriptionId);
    const { error } = on ? await update.is("payment_failed_at", null) : await update.not("payment_failed_at", "is", null);
    if (error) console.warn(`[WEBHOOK] Could not ${on ? "record" : "clear"} payment_failed_at: ${error.message}`);
  }

  async function userIdForSubscription(subscriptionId: string): Promise<string | null> {
    const { data } = await supabase.from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    return data?.user_id ?? null;
  }

  async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.user_id;
    if (!userId) {
      throw new Error("checkout.session.completed missing user_id in metadata");
    }

    if (!session.subscription) {
      // A checkout.session.completed event without a subscription means the
      // session wasn't our subscription checkout (e.g. mode "payment"/"setup").
      // Nothing for this handler to do; don't retrieve/upsert on a missing id.
      console.log(`[WEBHOOK] checkout.session.completed for user ${userId} has no subscription (mode=${session.mode}); skipping`);
      return;
    }
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;

    console.log(`[WEBHOOK] Checkout completed for user ${userId}, sub: ${subscriptionId}`);

    // Deleting an account cancels billing it can see. A Checkout that finishes
    // in that window would otherwise keep charging a subscription with no user,
    // and the database insert fails forever. Cancel it and acknowledge the event.
    const presence = await lookupAccount(userId);
    if (presence === "unknown") {
      throw new Error("Could not confirm the account for this checkout");
    }
    if (presence === "missing") {
      console.warn(`[WEBHOOK] Checkout completed after the account was deleted; canceling ${subscriptionId}`);
      await cancelSubscriptionIfPresent(subscriptionId);
      return;
    }

    // Fetch the full subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const subscriptionRow = {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: subscription.status as string,
      price_id: subscription.items.data[0]?.price.id,
      quantity: subscription.items.data[0]?.quantity,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: iso(subscription.current_period_start),
      current_period_end: iso(subscription.current_period_end),
      trial_start: subscription.trial_start ? iso(subscription.trial_start) : null,
      trial_end: subscription.trial_end ? iso(subscription.trial_end) : null,
    };

    const { error: subError } = await supabase.from("subscriptions")
      .upsert(subscriptionRow, { onConflict: "stripe_subscription_id" });

    if (subError) {
      console.error("[WEBHOOK] Failed to upsert subscription:", subError);
      throw new Error(`Failed to upsert subscription: ${subError.message}`);
    }

    await grantPro(userId, "Failed to update user tier");
    console.log(`[WEBHOOK] User ${userId} upgraded to Pro`);
  }

  async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    // Fetch the full subscription to get current period
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Take the status from Stripe too: a late payment event must not mark a
    // since-canceled subscription active again.
    const { error } = await supabase.from("subscriptions").update({
      status: subscription.status,
      current_period_start: iso(subscription.current_period_start),
      current_period_end: iso(subscription.current_period_end),
    }).eq("stripe_subscription_id", subscriptionId);

    if (error) {
      console.error("[WEBHOOK] Failed to update subscription on payment success:", error);
      throw new Error(`Failed to update subscription on payment success: ${error.message}`);
    }
    if (subscription.status === "active" || subscription.status === "trialing") {
      await markPaymentFailure(subscriptionId, false);
      // A recovered payment may arrive before its subscription.updated event,
      // and the old webhook downgraded the tier on the failure.
      const userId = await userIdForSubscription(subscriptionId);
      if (userId) await grantPro(userId, "Failed to restore Pro after payment");
    }

    console.log(`[WEBHOOK] Payment succeeded for subscription ${subscriptionId}`);
  }

  /**
   * A failed renewal does not end Pro. Stripe keeps the subscription past_due
   * and retries the invoice; the account keeps Pro for PAYMENT_GRACE_DAYS from
   * the first failure (billing-state.ts) and Settings asks for a new payment
   * method. When Stripe gives up it sends customer.subscription.updated
   * (unpaid) or .deleted, and those handlers end access. The tier stays as it
   * is: rewriting it to "expired" here told paying users their free trial had
   * ended and offered them a second subscription (QB-13).
   */
  async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const { error: subError } = await supabase.from("subscriptions").update({
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: iso(subscription.current_period_start),
      current_period_end: iso(subscription.current_period_end),
    }).eq("stripe_subscription_id", subscriptionId);

    if (subError) {
      console.error("[WEBHOOK] Failed to update subscription on payment failure:", subError);
      throw new Error(`Failed to update subscription on payment failure: ${subError.message}`);
    }
    // Retries of the same invoice keep the first failure's time.
    if (subscription.status === "past_due" || subscription.status === "unpaid") await markPaymentFailure(subscriptionId, true);

    console.log(`[WEBHOOK] Payment failed for subscription ${subscriptionId}; now ${subscription.status}`);
  }

  async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const subscriptionId = subscription.id;
    const userId = await userIdForSubscription(subscriptionId);
    const endedAt = subscription.ended_at ? iso(subscription.ended_at) : now().toISOString();

    // Update subscription record
    const { error: subError } = await supabase.from("subscriptions").update({
      status: "canceled",
      ended_at: endedAt,
      canceled_at: subscription.canceled_at ? iso(subscription.canceled_at) : endedAt,
    }).eq("stripe_subscription_id", subscriptionId);

    if (subError) {
      console.error("[WEBHOOK] Failed to update subscription on deletion:", subError);
      throw new Error(`Failed to update subscription on deletion: ${subError.message}`);
    }

    if (!userId) return;

    // A promo grant that ends later than now outlives the subscription.
    const { data: settings, error: settingsError } = await supabase.from("user_settings")
      .select("grace_period_ends_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (settingsError) throw new Error(`Failed to read user settings on cancellation: ${settingsError.message}`);
    if (promoGrantActive(settings?.grace_period_ends_at, now())) {
      console.log(`[WEBHOOK] User ${userId} subscription canceled; promo Pro continues`);
      return;
    }

    // Downgrade user. Upsert so a missing settings row doesn't silently no-op.
    const { error: userError } = await supabase.from("user_settings").upsert({
      user_id: userId,
      subscription_tier: "expired",
      updated_at: now().toISOString(),
    }, { onConflict: "user_id" });

    if (userError) {
      console.error("[WEBHOOK] Failed to downgrade user on cancellation:", userError);
      throw new Error(`Failed to downgrade user on cancellation: ${userError.message}`);
    }

    console.log(`[WEBHOOK] User ${userId} subscription canceled`);
  }

  async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const subscriptionId = subscription.id;

    const { error } = await supabase.from("subscriptions").update({
      status: subscription.status as string,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: iso(subscription.current_period_start),
      current_period_end: iso(subscription.current_period_end),
      cancel_at: subscription.cancel_at ? iso(subscription.cancel_at) : null,
      canceled_at: subscription.canceled_at ? iso(subscription.canceled_at) : null,
      ended_at: subscription.ended_at ? iso(subscription.ended_at) : null,
    }).eq("stripe_subscription_id", subscriptionId);

    if (error) {
      console.error("[WEBHOOK] Failed to update subscription:", error);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    // If subscription went active (or trialing), ensure user is pro. past_due and unpaid
    // leave the tier alone: the resolver reads the status itself.
    if (subscription.status === "active" || subscription.status === "trialing") {
      await markPaymentFailure(subscriptionId, false);
      const userId = await userIdForSubscription(subscriptionId);
      if (userId) await grantPro(userId, "Failed to upgrade user after subscription update");
    }

    console.log(`[WEBHOOK] Subscription ${subscriptionId} updated to ${subscription.status}`);
  }

  return {
    async handle(type: string, object: unknown) {
      switch (type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(object as Stripe.Checkout.Session);
          break;
        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(object as Stripe.Invoice);
          break;
        case "invoice.payment_failed":
          await handlePaymentFailed(object as Stripe.Invoice);
          break;
        case "customer.subscription.deleted":
        case "customer.subscription.updated": {
          const subscription = object as Stripe.Subscription;
          if (subscription.status === "canceled") await handleSubscriptionDeleted(subscription);
          else await handleSubscriptionUpdated(subscription);
          break;
        }
        default:
          console.log(`[WEBHOOK] Unhandled event type: ${type}`);
      }
    },
  };
}
