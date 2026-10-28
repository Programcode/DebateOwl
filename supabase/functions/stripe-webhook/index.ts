// Supabase Edge Function: Stripe Webhook Handler
// Processes Stripe events and syncs subscription state to the database.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { createEdgeStripe, Stripe } from "../_shared/stripe.ts";
import {
  duplicateWebhookResponse,
  processWebhookEvent,
  webhookFailureResponse,
} from "./webhook-event-lifecycle.ts";
import { createWebhookHandlers } from "./handlers.ts";

// Validate required environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!STRIPE_SECRET_KEY) throw new Error("Missing required env: STRIPE_SECRET_KEY");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("Missing required env: STRIPE_WEBHOOK_SECRET");
if (!SUPABASE_URL) throw new Error("Missing required env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing required env: SUPABASE_SERVICE_ROLE_KEY");

// Only the local full-stack gate sets this, to reach its fake Stripe.
const stripe = createEdgeStripe(STRIPE_SECRET_KEY, Deno.env.get("STRIPE_API_URL"));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;

const handlers = createWebhookHandlers({ supabase, stripe });

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
    const outcome = await processWebhookEvent(event as Stripe.Event & { data: { object: { id: string } } }, {
      // Claim and completion run on the database clock; see claim_webhook_event.
      claim: async (id, type) => {
        const { data, error } = await supabase.rpc("claim_webhook_event", { p_id: id, p_type: type });
        if (error) throw new Error(`Failed to claim webhook event: ${error.message}`);
        if (data !== "claimed" && data !== "duplicate" && data !== "in_progress") {
          throw new Error(`Unexpected webhook claim result: ${String(data)}`);
        }
        return data;
      },
      complete: async (id) => {
        const { error } = await supabase.rpc("complete_webhook_event", { p_id: id });
        // The handler's effects are applied; a missing marker only lets a
        // retry after the abandon window run the idempotent handlers again.
        if (error) console.error("[WEBHOOK] Failed to mark event complete:", error.message);
      },
      release: async (id) => {
        const { error } = await supabase.from("webhook_events").delete().eq("id", id);
        if (error) throw new Error(`Failed to release webhook event: ${error.message}`);
      },
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
      handle: handlers.handle,
    });
    if (outcome === "duplicate") {
      return new Response(JSON.stringify({ received: true, ...duplicateWebhookResponse() }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (outcome === "in_progress") {
      // Another delivery holds the claim. A non-2xx keeps Stripe retrying in
      // case that delivery dies before completing.
      return new Response(JSON.stringify({ received: false, error: "Event is being processed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const failure = webhookFailureResponse("Webhook processing failed");
    console.error(`[WEBHOOK] Error processing ${event.type}:`, message);
    // The failed delivery released its claim; return 5xx so Stripe retries.
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
