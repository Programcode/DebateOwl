// Supabase Edge Function: Stripe Webhook Handler
// Processes Stripe events and syncs subscription state to the database.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";

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
    console.error(`[WEBHOOK] Error processing ${event.type}:`, message);
    // Return 200 to avoid Stripe retrying — log the error for debugging
    return new Response(JSON.stringify({ received: true, error: message }), {
      status: 200,
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
    console.error("[WEBHOOK] checkout.session.completed missing user_id in metadata");
    return;
  }

  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  console.log(`[WEBHOOK] Checkout completed for user ${userId}, sub: ${subscriptionId}`);

  // Fetch the full subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Upsert subscription record
  const { error: subError } = await supabase.from("subscriptions").upsert({
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
  }, {
    onConflict: "stripe_subscription_id",
  });

  if (subError) {
    console.error("[WEBHOOK] Failed to upsert subscription:", subError);
  }

  // Update user tier to pro
  const { error: userError } = await supabase.from("user_settings").update({
    subscription_tier: "pro",
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  if (userError) {
    console.error("[WEBHOOK] Failed to update user tier:", userError);
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
    .single();

  // Update subscription status
  const { error: subError } = await supabase.from("subscriptions").update({
    status: "past_due",
  }).eq("stripe_subscription_id", subscriptionId);

  if (subError) {
    console.error("[WEBHOOK] Failed to update subscription on payment failure:", subError);
  }

  // Downgrade user immediately per spec
  if (sub?.user_id) {
    const { error: userError } = await supabase.from("user_settings").update({
      subscription_tier: "expired",
      updated_at: new Date().toISOString(),
    }).eq("user_id", sub.user_id);

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
    .single();

  // Update subscription record
  const { error: subError } = await supabase.from("subscriptions").update({
    status: "canceled",
    ended_at: new Date().toISOString(),
    canceled_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscriptionId);

  if (subError) {
    console.error("[WEBHOOK] Failed to update subscription on deletion:", subError);
  }

  // Downgrade user
  if (sub?.user_id) {
    const { error: userError } = await supabase.from("user_settings").update({
      subscription_tier: "expired",
      updated_at: new Date().toISOString(),
    }).eq("user_id", sub.user_id);

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
  }

  // If subscription went active, ensure user is pro
  if (subscription.status === "active") {
    const { data: sub } = await supabase.from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (sub?.user_id) {
      await supabase.from("user_settings").update({
        subscription_tier: "pro",
        updated_at: new Date().toISOString(),
      }).eq("user_id", sub.user_id);
    }
  }

  console.log(`[WEBHOOK] Subscription ${subscriptionId} updated to ${subscription.status}`);
}
