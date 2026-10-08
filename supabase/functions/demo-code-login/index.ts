import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import {
  getDemoCodeDenialReason,
  getDemoLoginRole,
  hashDemoCode,
  isDemoCodeRateLimited,
  isDemoUserForCode,
  isValidDemoCode,
  normalizeDemoCode,
} from "../_shared/demo-code.ts";


const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type DemoAccessCode = {
  id: string;
  code_hash: string;
  label: string;
  email: string;
  role: "user" | "admin" | "banned";
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  disabled_at: string | null;
};


// Only hand generateLink a redirectTo that points at one of our own origins,
// so a client-supplied value can't be used for an open redirect off the auth
// handoff link.
function sanitizeRedirectTo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    // Web origins only: a non-http(s) scheme must never be a generateLink
    // redirect target, even if a future CORS entry allows it.
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return isAllowedOrigin(`${url.protocol}//${url.host}`) ? value : undefined;
  } catch {
    return undefined;
  }
}

function getIpAddress(req: Request) {
  // The right-most entry in X-Forwarded-For is the one appended by our own
  // trusted edge proxy; earlier entries can be forged by the client. Taking
  // the first entry (as this used to) let an attacker spoof a fresh IP on
  // every request and bypass the rate limit below entirely.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") || null;
}

async function recordAttempt(input: {
  codeHash?: string;
  ipAddress: string | null;
  browserFingerprint: string | null;
  success: boolean;
  failureReason?: string;
}) {
  const { error } = await supabase.from("demo_access_attempts").insert({
    code_hash: input.codeHash || null,
    ip_address: input.ipAddress,
    browser_fingerprint: input.browserFingerprint,
    success: input.success,
    failure_reason: input.failureReason || null,
  });
  if (error) console.warn("[DEMO_CODE] attempt insert failed", error.message);
}

async function isRateLimited(ipAddress: string | null, browserFingerprint: string | null) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const checks: Promise<number>[] = [];

  if (ipAddress) {
    checks.push(Promise.resolve(
      supabase
          .from("demo_access_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip_address", ipAddress)
          .eq("success", false)
          .gte("created_at", since)
          .then(({ count, error }) => {
            if (error) throw error;
            return count || 0;
          }),
    ),
    );
  }

  if (browserFingerprint) {
    checks.push(Promise.resolve(
      supabase
          .from("demo_access_attempts")
          .select("id", { count: "exact", head: true })
          .eq("browser_fingerprint", browserFingerprint)
          .eq("success", false)
          .gte("created_at", since)
          .then(({ count, error }) => {
            if (error) throw error;
            return count || 0;
          }),
    ),
    );
  }

  if (checks.length === 0) return false;
  const counts = await Promise.all(checks);
  return isDemoCodeRateLimited(counts);
}

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function handleRequest(req: Request) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ipAddress = getIpAddress(req);

  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeDemoCode(body.code);
    const browserFingerprint = String(body.browserFingerprint || "").slice(0, 256) || null;

    if (await isRateLimited(ipAddress, browserFingerprint)) {
      await recordAttempt({ ipAddress, browserFingerprint, success: false, failureReason: "rate_limited" });
      return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidDemoCode(code)) {
      await recordAttempt({ ipAddress, browserFingerprint, success: false, failureReason: "invalid_format" });
      return new Response(JSON.stringify({ error: "Enter a valid demo code." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const codeHash = await hashDemoCode(code);
    const { data: demoCode, error: lookupError } = await supabase
      .from("demo_access_codes")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle<DemoAccessCode>();

    if (lookupError) throw lookupError;

    if (!demoCode) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "not_found" });
      return new Response(JSON.stringify({ error: "Demo code not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const denialReason = getDemoCodeDenialReason(demoCode);
    if (denialReason === "disabled") {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "disabled" });
      return new Response(JSON.stringify({ error: "This demo code has been disabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (denialReason === "expired") {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "expired" });
      return new Response(JSON.stringify({ error: "This demo code has expired." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (denialReason === "max_uses") {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "max_uses" });
      return new Response(JSON.stringify({ error: "This demo code has no uses left." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingUser = await findUserByEmail(demoCode.email);
    if (existingUser && !isDemoUserForCode(existingUser.app_metadata, demoCode.id)) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "email_conflict" });
      return new Response(JSON.stringify({ error: "This demo code cannot be used." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingUser) {
      const { data: existingRole, error: existingRoleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", existingUser.id)
        .maybeSingle<{ role: string }>();
      if (existingRoleError) throw existingRoleError;
      if (existingRole?.role === "admin" || existingRole?.role === "banned") {
        await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "account_role_conflict" });
        return new Response(JSON.stringify({ error: "This demo code cannot be used." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Reserve the use atomically before creating or changing the demo account.
    const { data: reservation, error: reservationError } = await supabase.rpc("consume_demo_access_code", {
      p_code_id: demoCode.id,
    });
    if (reservationError) throw reservationError;
    const reservationRow = Array.isArray(reservation) ? reservation[0] : reservation;
    if (!reservationRow?.reserved) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "max_uses" });
      return new Response(JSON.stringify({ error: "This demo code has no uses left." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userResult = existingUser
      ? { user: existingUser }
      : (await supabase.auth.admin.createUser({
        email: demoCode.email,
        email_confirm: true,
        app_metadata: {
          demo_access_code_id: demoCode.id,
        },
        user_metadata: {
          demo_label: demoCode.label,
        },
      })).data;

    if (!userResult.user) throw new Error("Could not prepare demo user");

    // Never let a demo code grant admin: the schema allows demo_access_codes.role
    // to be "admin", but self-service demo sign-in must not be a privilege
    // escalation path. Admin status is granted separately, not through this flow.
    const grantedRole = getDemoLoginRole(demoCode.role);
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        user_id: userResult.user.id,
        role: grantedRole,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (roleError) throw roleError;

    // Demo accounts get lifetime Pro access with a high daily cap so the
    // experience matches what a paying user would see during a demo.
    const { error: settingsError } = await supabase
      .from("user_settings")
      .upsert({
        user_id: userResult.user.id,
        subscription_tier: "pro",
        grace_period_ends_at: "9999-12-31T23:59:59.999Z",
        daily_limit_override: 999,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (settingsError) throw settingsError;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: demoCode.email,
      options: {
        redirectTo: sanitizeRedirectTo(body.redirectTo),
      },
    });

    if (linkError) throw linkError;
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("Could not create demo session handoff");

    await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: true });

    return new Response(JSON.stringify({
      email: demoCode.email,
      tokenHash,
      type: linkData.properties?.verification_type || "magiclink",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[DEMO_CODE] Error:", message);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
