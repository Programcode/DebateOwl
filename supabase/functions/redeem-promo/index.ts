// Supabase Edge Function: Redeem Promo Code
// Validates and applies promo codes for users.

import { type AuthContext, HttpError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Authenticate. The browser expects { success, message } from this function.
  let auth: AuthContext;
  try {
    auth = await requireUser(req);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    console.warn("[PROMO] Authentication rejected:", error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: error.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { user, userClient } = auth;

  try {
    const body = await req.json();
    const code = (body.code as string || "").trim().toUpperCase();

    if (!code) {
      return new Response(JSON.stringify({ success: false, message: "Please enter a promo code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: result, error: redeemError } = await userClient.rpc("redeem_promo_code_atomic", { p_code: code });

    if (redeemError) {
      throw redeemError;
    }

    console.log(`[PROMO] User ${user.id} redeemed code ${code} (type: ${result?.promoType || "unknown"})`);

    return new Response(JSON.stringify({
      success: Boolean(result?.success),
      message: result?.message || "Promo code applied!",
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
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
