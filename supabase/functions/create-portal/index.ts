// Supabase Edge Function: Create Stripe Customer Portal Session
// Generates a portal URL so users can manage their subscription.

import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { createEdgeStripe } from "../_shared/stripe.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  findCustomerOwnedByUser,
  isAllowedCheckoutRedirectUrl,
} from "../create-checkout/checkout-security.ts";

// Validate required environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!STRIPE_SECRET_KEY) throw new Error("Missing required env: STRIPE_SECRET_KEY");
if (!SUPABASE_URL) throw new Error("Missing required env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing required env: SUPABASE_SERVICE_ROLE_KEY");

const stripe = createEdgeStripe(STRIPE_SECRET_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);



async function findCustomerIdByUser(user: { id: string; email?: string | null }): Promise<string | null> {
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.warn(`[PORTAL] Subscription lookup warning for ${user.id}: ${subError.message}`);
  }

  if (sub?.stripe_customer_id) {
    return sub.stripe_customer_id;
  }

  if (!user.email) {
    return null;
  }

  const candidates = await stripe.customers.list({ email: user.email, limit: 10 });
  return findCustomerOwnedByUser(candidates.data, user.id);
}

// The browser translates this code; the English message stays for older browsers.
const NO_ACTIVE_SUBSCRIPTION = {
  error: "No active subscription found. Upgrade to Pro to start a subscription.",
  code: "no_active_subscription",
};

function classifyStripeError(err: unknown): { status: number; message: string; code?: string } {
  const stripeErr = err as {
    type?: string;
    code?: string;
    message?: string;
    statusCode?: number;
  };

  const message = typeof stripeErr.message === "string" && stripeErr.message.trim()
    ? stripeErr.message
    : "Failed to create billing portal session";

  if (stripeErr.code === "resource_missing") {
    return { status: 400, message: NO_ACTIVE_SUBSCRIPTION.error, code: NO_ACTIVE_SUBSCRIPTION.code };
  }

  if (typeof stripeErr.statusCode === "number") {
    if (stripeErr.statusCode >= 400 && stripeErr.statusCode < 500) {
      return { status: 400, message };
    }
    if (stripeErr.statusCode >= 500) {
      return { status: 502, message };
    }
  }

  return { status: 500, message };
}

export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Authenticate user
  let user: User;
  try {
    user = (await requireUser(req)).user;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    console.warn("[PORTAL] Authentication rejected:", error.message);
    return jsonError(error, corsHeaders);
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = (body && typeof body === "object") ? body as Record<string, unknown> : {};
    const returnUrl = typeof rawBody.returnUrl === "string" ? rawBody.returnUrl.trim() : "";

    if (!returnUrl) {
      return new Response(JSON.stringify({ error: "Missing returnUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedCheckoutRedirectUrl(returnUrl)) {
      return new Response(JSON.stringify({ error: "returnUrl must use an approved app origin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = await findCustomerIdByUser({ id: user.id, email: user.email });
    if (!customerId) {
      return new Response(JSON.stringify(NO_ACTIVE_SUBSCRIPTION), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log(`[PORTAL] Created session for user ${user.id}`);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const { status, message, code } = classifyStripeError(err);
    console.error("[PORTAL] Error:", message);
    return new Response(JSON.stringify({ error: message, ...(code ? { code } : {}) }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
