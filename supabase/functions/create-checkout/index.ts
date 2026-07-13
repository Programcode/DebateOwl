// Supabase Edge Function: Create Stripe Checkout Session
// Creates a Checkout Session for subscription purchase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";
import {
  findCustomerOwnedByUser,
  isAllowedCheckoutRedirectUrl,
} from "./checkout-security.ts";

// Validate required environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID")?.trim() || "";
const STRIPE_PRICE_LOOKUP_KEY = Deno.env.get("STRIPE_PRICE_LOOKUP_KEY")?.trim() || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!STRIPE_SECRET_KEY) throw new Error("Missing required env: STRIPE_SECRET_KEY");
if (!SUPABASE_URL) throw new Error("Missing required env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing required env: SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
  "capacitor://localhost",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function isStripePriceId(value: string): boolean {
  return /^price_[A-Za-z0-9]+$/.test(value);
}

class AppError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function isDeletedPrice(price: Stripe.Price | Stripe.DeletedPrice): price is Stripe.DeletedPrice {
  return "deleted" in price && price.deleted;
}

function isActiveRecurringPrice(price: Stripe.Price | Stripe.DeletedPrice): price is Stripe.Price {
  return !isDeletedPrice(price) && price.active && price.type === "recurring";
}

async function resolvePriceByLookupKey(lookupKey: string): Promise<string | null> {
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 10,
  });
  const recurring = prices.data.find((price: Stripe.Price | Stripe.DeletedPrice) => isActiveRecurringPrice(price));
  return recurring?.id || null;
}

async function resolveCheckoutPriceId(inputPriceId: string, inputLookupKey: string): Promise<{ id: string; source: string }> {
  const candidatePriceIds = [STRIPE_PRICE_ID, inputPriceId]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const candidate of candidatePriceIds) {
    if (!isStripePriceId(candidate)) {
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(candidate);
      if (isActiveRecurringPrice(price)) {
        return { id: price.id, source: `price_id:${candidate === STRIPE_PRICE_ID ? "env" : "request"}` };
      }
    } catch (err) {
      const stripeErr = err as { code?: string; statusCode?: number };
      if (stripeErr.code !== "resource_missing" && stripeErr.statusCode !== 404) {
        throw err;
      }
    }
  }

  const candidateLookupKeys = [STRIPE_PRICE_LOOKUP_KEY, inputLookupKey]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const lookupKey of candidateLookupKeys) {
    const resolved = await resolvePriceByLookupKey(lookupKey);
    if (resolved) {
      return { id: resolved, source: `lookup_key:${lookupKey === STRIPE_PRICE_LOOKUP_KEY ? "env" : "request"}` };
    }
  }

  const recurringPrices = await stripe.prices.list({
    active: true,
    type: "recurring",
    limit: 10,
  });

  if (recurringPrices.data.length === 1) {
    return { id: recurringPrices.data[0].id, source: "auto_single_recurring_price" };
  }

  if (recurringPrices.data.length === 0) {
    throw new AppError(
      400,
      "No active recurring Stripe prices found. Configure STRIPE_PRICE_ID or STRIPE_PRICE_LOOKUP_KEY.",
      { configuredPriceId: STRIPE_PRICE_ID || null, configuredLookupKey: STRIPE_PRICE_LOOKUP_KEY || null },
    );
  }

  throw new AppError(
    400,
    "Unable to choose a Stripe price. Provide VITE_STRIPE_PRICE_ID, STRIPE_PRICE_ID, or STRIPE_PRICE_LOOKUP_KEY.",
    {
      recurringPriceCount: recurringPrices.data.length,
      recurringPriceIds: recurringPrices.data.map((price: Stripe.Price) => price.id),
      configuredPriceId: STRIPE_PRICE_ID || null,
      configuredLookupKey: STRIPE_PRICE_LOOKUP_KEY || null,
    },
  );
}

async function findCustomerIdByUser(user: { id: string; email?: string | null }): Promise<string | null> {
  const { data: existingSub, error: subLookupError } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (subLookupError) {
    console.warn(`[CHECKOUT] Subscription lookup warning for ${user.id}: ${subLookupError.message}`);
  }

  if (existingSub?.stripe_customer_id) {
    return existingSub.stripe_customer_id;
  }

  try {
    const result = await stripe.customers.search({
      query: `metadata['user_id']:'${user.id}'`,
      limit: 1,
    });
    const customerId = findCustomerOwnedByUser(result.data, user.id);
    if (customerId) {
      return customerId;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "search failed";
    console.warn(`[CHECKOUT] Customer search warning for ${user.id}: ${message}`);
  }

  return null;
}

function classifyStripeError(err: unknown): { status: number; message: string; details: Record<string, unknown> } {
  const stripeErr = err as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
    statusCode?: number;
  };

  const details: Record<string, unknown> = {
    type: stripeErr.type,
    code: stripeErr.code,
    param: stripeErr.param,
    statusCode: stripeErr.statusCode,
  };

  const message = typeof stripeErr.message === "string" && stripeErr.message.trim()
    ? stripeErr.message
    : "Failed to create checkout session";

  if (typeof stripeErr.statusCode === "number") {
    if (stripeErr.statusCode >= 400 && stripeErr.statusCode < 500) {
      return { status: 400, message, details };
    }
    if (stripeErr.statusCode >= 500) {
      return { status: 502, message, details };
    }
  }

  if (typeof stripeErr.type === "string" && stripeErr.type.toLowerCase().includes("invalidrequest")) {
    return { status: 400, message, details };
  }

  return { status: 500, message, details };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Authenticate user
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    const requestedPriceId = typeof rawBody.priceId === "string" ? rawBody.priceId.trim() : "";
    const requestedLookupKey = typeof rawBody.lookupKey === "string" ? rawBody.lookupKey.trim() : "";
    const successUrl = typeof rawBody.successUrl === "string" ? rawBody.successUrl.trim() : "";
    const cancelUrl = typeof rawBody.cancelUrl === "string" ? rawBody.cancelUrl.trim() : "";
    const promoCode = typeof rawBody.promoCode === "string" ? rawBody.promoCode.trim() : undefined;

    if (!successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields: successUrl, cancelUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedCheckoutRedirectUrl(successUrl) || !isAllowedCheckoutRedirectUrl(cancelUrl)) {
      return new Response(JSON.stringify({ error: "successUrl and cancelUrl must use an approved app origin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedPrice = await resolveCheckoutPriceId(requestedPriceId, requestedLookupKey);

    // Get or create Stripe customer
    let customerId = await findCustomerIdByUser({ id: user.id, email: user.email });
    if (!customerId) {
      const customerParams: Stripe.CustomerCreateParams = {
        metadata: { user_id: user.id },
      };
      if (user.email) {
        customerParams.email = user.email;
      }

      const customer = await stripe.customers.create(customerParams);
      customerId = customer.id;
    }

    // Build checkout session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: resolvedPrice.id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      subscription_data: {
        metadata: { user_id: user.id },
      },
    };

    // Apply promo code if provided
    if (promoCode) {
      const { data: promo, error: promoLookupError } = await supabase.from("promo_codes")
        .select("*")
        .eq("code", promoCode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (promoLookupError) {
        console.warn(`[CHECKOUT] Promo lookup warning for ${promoCode}: ${promoLookupError.message}`);
      }

      if (promo && promo.type === "discount") {
        const { data: existingRedemption, error: redemptionLookupError } = await supabase.from("user_promos")
          .select("id")
          .eq("user_id", user.id)
          .eq("promo_code_id", promo.id)
          .maybeSingle();

        if (redemptionLookupError) {
          console.warn(`[CHECKOUT] Promo redemption lookup warning for ${promoCode}: ${redemptionLookupError.message}`);
        }

        if (existingRedemption) {
          return new Response(JSON.stringify({ error: "You've already redeemed this promo code" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        sessionParams.allow_promotion_codes = true;
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`[CHECKOUT] Session created for ${user.id}: ${session.id} (price=${resolvedPrice.id}, source=${resolvedPrice.source})`);

    return new Response(JSON.stringify({ url: session.url, priceId: resolvedPrice.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return new Response(JSON.stringify({ error: err.message, details: err.details }), {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { status, message, details } = classifyStripeError(err);
    console.error("[CHECKOUT] Error:", JSON.stringify({ message, ...details }));
    return new Response(JSON.stringify({ error: message, details }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
