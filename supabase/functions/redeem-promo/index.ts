// Supabase Edge Function: Redeem Promo Code
// Validates and applies promo codes for users.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
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

  // Authenticate
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ success: false, message: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const code = (body.code as string || "").trim().toUpperCase();

    if (!code) {
      return new Response(JSON.stringify({ success: false, message: "Please enter a promo code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the promo code
    const { data: promo, error: promoError } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (promoError || !promo) {
      return new Response(JSON.stringify({ success: false, message: "Invalid or expired promo code" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return new Response(JSON.stringify({ success: false, message: "This promo code has expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check max redemptions
    if (promo.max_redemptions && promo.redemptions_count >= promo.max_redemptions) {
      return new Response(JSON.stringify({ success: false, message: "This promo code has reached its usage limit" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already used this code
    const { data: existing } = await supabase
      .from("user_promos")
      .select("id")
      .eq("user_id", user.id)
      .eq("promo_code_id", promo.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: false, message: "You've already redeemed this code" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply the promo based on type
    const config = promo.config as Record<string, number>;

    switch (promo.type) {
      case "extended_trial": {
        const days = config.days || 30;
        const newTrialEnd = new Date();
        newTrialEnd.setDate(newTrialEnd.getDate() + days);
        await supabase.from("user_settings").update({
          trial_ends_at: newTrialEnd.toISOString(),
          subscription_tier: "trial",
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        break;
      }
      case "extra_limit": {
        const limit = config.limit || 15;
        await supabase.from("user_settings").update({
          daily_limit_override: limit,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        break;
      }
      case "free_month": {
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + (config.days || 30));
        await supabase.from("user_settings").update({
          subscription_tier: "pro",
          grace_period_ends_at: graceEnd.toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        break;
      }
      case "lifetime_pro": {
        await supabase.from("user_settings").update({
          subscription_tier: "pro",
          daily_limit_override: config.limit || 50,
          grace_period_ends_at: "9999-12-31T23:59:59.999Z",
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        break;
      }
      case "discount": {
        // Discount codes are applied at checkout, not here
        return new Response(JSON.stringify({
          success: true,
          message: "Discount code noted! Apply it at checkout for a discount.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Record the redemption
    await supabase.from("user_promos").insert({
      user_id: user.id,
      promo_code_id: promo.id,
    });

    // Increment redemption count
    await supabase.from("promo_codes").update({
      redemptions_count: (promo.redemptions_count || 0) + 1,
    }).eq("id", promo.id);

    console.log(`[PROMO] User ${user.id} redeemed code ${code} (type: ${promo.type})`);

    const messages: Record<string, string> = {
      extended_trial: `Trial extended by ${config.days || 30} days!`,
      extra_limit: `Daily limit upgraded to ${config.limit || 15} requests!`,
      free_month: `Enjoy ${config.days || 30} days of free Pro access!`,
      lifetime_pro: "Lifetime Pro access unlocked!",
    };

    return new Response(JSON.stringify({
      success: true,
      message: messages[promo.type] || "Promo code applied!",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PROMO] Error:", message);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
