import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
];

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const demoCodePepper = Deno.env.get("DEMO_CODE_PEPPER") || supabaseServiceKey;
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

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function normalizeCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashCode(code: string) {
  return sha256Hex(`${demoCodePepper}:${code}`);
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
          .then(({ count }) => count || 0),
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
          .then(({ count }) => count || 0),
    ),
    );
  }

  if (checks.length === 0) return false;
  const counts = await Promise.all(checks);
  return counts.some((count) => count >= 10);
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

Deno.serve(async (req) => {
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
    const code = normalizeCode(body.code);
    const browserFingerprint = String(body.browserFingerprint || "").slice(0, 256) || null;

    if (await isRateLimited(ipAddress, browserFingerprint)) {
      await recordAttempt({ ipAddress, browserFingerprint, success: false, failureReason: "rate_limited" });
      return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      await recordAttempt({ ipAddress, browserFingerprint, success: false, failureReason: "invalid_format" });
      return new Response(JSON.stringify({ error: "Enter a valid demo code." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const codeHash = await hashCode(code);
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

    if (demoCode.disabled_at) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "disabled" });
      return new Response(JSON.stringify({ error: "This demo code has been disabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (demoCode.expires_at && new Date(demoCode.expires_at).getTime() <= Date.now()) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "expired" });
      return new Response(JSON.stringify({ error: "This demo code has expired." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (demoCode.max_uses !== null && demoCode.use_count >= demoCode.max_uses) {
      await recordAttempt({ codeHash, ipAddress, browserFingerprint, success: false, failureReason: "max_uses" });
      return new Response(JSON.stringify({ error: "This demo code has no uses left." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingUser = await findUserByEmail(demoCode.email);
    const userResult = existingUser
      ? { user: existingUser }
      : (await supabase.auth.admin.createUser({
        email: demoCode.email,
        email_confirm: true,
        user_metadata: {
          demo_access_code_id: demoCode.id,
          demo_label: demoCode.label,
        },
      })).data;

    if (!userResult.user) throw new Error("Could not prepare demo user");

    // Never let a demo code grant admin: the schema allows demo_access_codes.role
    // to be "admin", but self-service demo sign-in must not be a privilege
    // escalation path. Admin status is granted separately, not through this flow.
    const grantedRole = demoCode.role === "banned" ? "banned" : "user";
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

    const { error: usageError } = await supabase
      .from("demo_access_codes")
      .update({
        use_count: demoCode.use_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", demoCode.id);

    if (usageError) throw usageError;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: demoCode.email,
      options: {
        redirectTo: body.redirectTo || undefined,
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
});
