// Supabase Edge Function: Create Stripe Checkout Session
// Creates a Checkout Session for subscription purchase.

import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
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

// Price selection is server-authoritative only: the checkout price must come
// from STRIPE_PRICE_ID / STRIPE_PRICE_LOOKUP_KEY (or the auto-single-price
// fallback below), never from client-supplied priceId/lookupKey fields. A
// client-chosen Stripe price ID would let a caller check out at any active
// recurring price in the account, not just the intended subscription price.
async function resolveCheckoutPriceId(): Promise<{ id: string; source: string }> {
  const configuredPriceId = STRIPE_PRICE_ID.trim();
  if (configuredPriceId && isStripePriceId(configuredPriceId)) {
    try {
      const price = await stripe.prices.retrieve(configuredPriceId);
      if (isActiveRecurringPrice(price)) {
        return { id: price.id, source: "price_id:env" };
      }
    } catch (err) {
      const stripeErr = err as { code?: string; statusCode?: number };
      if (stripeErr.code !== "resource_missing" && stripeErr.statusCode !== 404) {
        throw err;
      }
    }
  }

  const configuredLookupKey = STRIPE_PRICE_LOOKUP_KEY.trim();
  if (configuredLookupKey) {
    const resolved = await resolvePriceByLookupKey(configuredLookupKey);
    if (resolved) {
      return { id: resolved, source: "lookup_key:env" };
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
    "Unable to choose a Stripe price. Configure STRIPE_PRICE_ID or STRIPE_PRICE_LOOKUP_KEY, or leave exactly one active recurring price in Stripe.",
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
    console.warn("[CHECKOUT] Authentication rejected:", error.message);
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
    // Note: any client-supplied priceId/lookupKey fields are intentionally
    // ignored — the checkout price is resolved exclusively from server config
    // (see resolveCheckoutPriceId) so a caller can't select an arbitrary price.
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

    const resolvedPrice = await resolveCheckoutPriceId();

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

    // Account deletion reads this to cancel billing before the webhook has
    // recorded a subscription, so no session opens without it.
    const { error: customerRecordError } = await supabase.from("stripe_customers")
      .upsert({ user_id: user.id, customer_id: customerId }, { onConflict: "user_id,customer_id", ignoreDuplicates: true });
    if (customerRecordError) {
      console.error(`[CHECKOUT] Could not record customer for ${user.id}: ${customerRecordError.code}`);
      return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        console.warn(`[CHECKOUT] Promo lookup failed`);
      }

      if (promo && promo.type === "discount") {
        const { data: existingRedemption, error: redemptionLookupError } = await supabase.from("user_promos")
          .select("id")
          .eq("user_id", user.id)
          .eq("promo_code_id", promo.id)
          .maybeSingle();

        if (redemptionLookupError) {
          console.warn(`[CHECKOUT] Promo redemption lookup failed`);
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
      console.error("[CHECKOUT] Configuration error:", err.message.slice(0, 2000));
      return new Response(JSON.stringify({ error: "Unable to create checkout session. Please try again." }), {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { status, message, details } = classifyStripeError(err);
    console.error("[CHECKOUT] Error:", JSON.stringify({ message, ...details }).slice(0, 2000));
    return new Response(JSON.stringify({ error: "Unable to create checkout session. Please try again." }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
