// Supabase Edge Function: Stripe Webhook Handler
// Processes Stripe events and syncs subscription state to the database.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";
import {
  duplicateWebhookResponse,
  webhookFailureResponse,
} from "./webhook-event-lifecycle.ts";

// Validate required environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!STRIPE_SECRET_KEY) throw new Error("Missing required env: STRIPE_SECRET_KEY");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("Missing required env: STRIPE_WEBHOOK_SECRET");
if (!SUPABASE_URL) throw new Error("Missing required env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing required env: SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[WEBHOOK] Missing stripe-signature header");
    return new Response("Missing signature", { status: 400, headers: corsHeaders });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[WEBHOOK] Signature verification failed:", message);
    return new Response(`Webhook Error: ${message}`, { status: 400, headers: corsHeaders });
  }

  console.log(`[WEBHOOK] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const failure = webhookFailureResponse(message);
    console.error(`[WEBHOOK] Error processing ${event.type}:`, message);
    // Return 5xx so Stripe retries. The idempotency record is written only after success.
    return new Response(JSON.stringify(failure), {
      status: failure.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: eventInsertError } = await supabase.from("webhook_events").insert({
    id: event.id,
    event_type: event.type,
  });

  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      const duplicate = duplicateWebhookResponse();
      console.log(`[WEBHOOK] Duplicate event ignored: ${event.id}`);
      return new Response(JSON.stringify({ received: true, ...duplicate }), {
        status: duplicate.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const failure = webhookFailureResponse("Failed to record webhook event");
    console.error("[WEBHOOK] Failed to record webhook event:", eventInsertError);
    return new Response(JSON.stringify(failure), {
      status: failure.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ============================================================
// EVENT HANDLERS
// ============================================================

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
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
  };

  const { error: subError } = await supabase.from("subscriptions")
    .upsert(subscriptionRow, { onConflict: "stripe_subscription_id" });

  if (subError) {
    console.error("[WEBHOOK] Failed to upsert subscription:", subError);
    throw new Error(`Failed to upsert subscription: ${subError.message}`);
  }

  // Update user tier to pro. Upsert (not update) so a missing user_settings
  // row doesn't silently no-op and leave a paying user without entitlements.
  const { error: userError } = await supabase.from("user_settings").upsert({
    user_id: userId,
    subscription_tier: "pro",
    grace_period_ends_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (userError) {
    console.error("[WEBHOOK] Failed to update user tier:", userError);
    throw new Error(`Failed to update user tier: ${userError.message}`);
  }

  console.log(`[WEBHOOK] User ${userId} upgraded to Pro`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Fetch the full subscription to get current period
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const { error } = await supabase.from("subscriptions").update({
    status: "active",
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  }).eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("[WEBHOOK] Failed to update subscription on payment success:", error);
    throw new Error(`Failed to update subscription on payment success: ${error.message}`);
  }

  console.log(`[WEBHOOK] Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Find the user for this subscription
  const { data: sub } = await supabase.from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  // Update subscription status
  const { error: subError } = await supabase.from("subscriptions").update({
    status: "past_due",
  }).eq("stripe_subscription_id", subscriptionId);

  if (subError) {
    console.error("[WEBHOOK] Failed to update subscription on payment failure:", subError);
    throw new Error(`Failed to update subscription on payment failure: ${subError.message}`);
  }

  // Downgrade user immediately per spec. Upsert so a missing settings row
  // doesn't silently no-op.
  if (sub?.user_id) {
    const { error: userError } = await supabase.from("user_settings").upsert({
      user_id: sub.user_id,
      subscription_tier: "expired",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (userError) {
      console.error("[WEBHOOK] Failed to downgrade user on payment failure:", userError);
    }

    console.log(`[WEBHOOK] User ${sub.user_id} downgraded due to payment failure`);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  // Find the user for this subscription
  const { data: sub } = await supabase.from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  // Update subscription record
  const { error: subError } = await supabase.from("subscriptions").update({
    status: "canceled",
    ended_at: new Date().toISOString(),
    canceled_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscriptionId);

  if (subError) {
    console.error("[WEBHOOK] Failed to update subscription on deletion:", subError);
    throw new Error(`Failed to update subscription on deletion: ${subError.message}`);
  }

  // Downgrade user. Upsert so a missing settings row doesn't silently no-op.
  if (sub?.user_id) {
    const { error: userError } = await supabase.from("user_settings").upsert({
      user_id: sub.user_id,
      subscription_tier: "expired",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (userError) {
      console.error("[WEBHOOK] Failed to downgrade user on cancellation:", userError);
    }

    console.log(`[WEBHOOK] User ${sub.user_id} subscription canceled`);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  const { error } = await supabase.from("subscriptions").update({
    status: subscription.status as string,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    ended_at: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
  }).eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error("[WEBHOOK] Failed to update subscription:", error);
    throw new Error(`Failed to update subscription: ${error.message}`);
  }

  // If subscription went active, ensure user is pro
  if (subscription.status === "active") {
    const { data: sub } = await supabase.from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (sub?.user_id) {
      // Upsert so a missing settings row doesn't silently no-op.
      const { error: userError } = await supabase.from("user_settings").upsert({
        user_id: sub.user_id,
        subscription_tier: "pro",
        grace_period_ends_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      if (userError) {
        throw new Error(`Failed to upgrade user after subscription update: ${userError.message}`);
      }
    }
  }

  console.log(`[WEBHOOK] Subscription ${subscriptionId} updated to ${subscription.status}`);
}
