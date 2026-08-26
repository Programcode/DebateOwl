import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl } from "./url-validation.ts";
import { readBoundedText } from "./resource-limits.ts";

// Re-export helpers so existing callers (if any) keep working.
export { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl };

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
  "capacitor://localhost",
];

const MAX_CONTENT_CHARS = 50_000;
const EXA_RESPONSE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const DAILY_IMPORT_LIMIT = 50;
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type ExaContentsResult = {
  url?: unknown;
  title?: unknown;
  text?: unknown;
  author?: unknown;
  publishedDate?: unknown;
};

type ExaContentsResponse = {
  results?: unknown;
};

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function isUserBanned(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  return data?.role === "banned";
}

async function consumeDailyImportQuota(userId: string): Promise<{ allowed: boolean; currentCount: number }> {
  const { data, error } = await supabase.rpc("consume_daily_quota", {
    p_user_id: userId,
    p_limit: DAILY_IMPORT_LIMIT,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: Boolean(row?.allowed), currentCount: row?.current_count ?? 0 };
}

async function logImport(userId: string, status: "success" | "error", errorCode?: string, latencyMs?: number) {
  try {
    await supabase.from("ai_requests").insert({
      user_id: userId,
      feature: "import_source",
      provider: "exa",
      model: "url-import",
      latency_ms: latencyMs,
      status,
      error_code: errorCode,
    });
  } catch (err) {
    console.warn("[IMPORT_SOURCE] logImport failed", err instanceof Error ? err.message : String(err));
  }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

/**
 * Fetch user-requested public content through Exa's fixed contents endpoint.
 * The Edge Function never opens a network connection to the user-controlled
 * hostname, which removes the DNS-rebinding/TOCTOU gap inherent in validating
 * a hostname and then asking ordinary fetch() to resolve it again.
 */
async function extractViaExa(requestedUrl: URL) {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    throw new Error("Source import is unavailable because content extraction is not configured.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(EXA_CONTENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        urls: [requestedUrl.toString()],
        text: { max_characters: MAX_CONTENT_CHARS },
      }),
      signal: controller.signal,
    });

    const raw = await readBoundedText(response, EXA_RESPONSE_BYTES, FETCH_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`Content extraction failed (${response.status}).`);
    }

    let payload: ExaContentsResponse;
    try {
      payload = JSON.parse(raw) as ExaContentsResponse;
    } catch {
      throw new Error("Content extraction returned an invalid response.");
    }
    if (!Array.isArray(payload.results) || payload.results.length === 0) {
      throw new Error("This page did not return readable content.");
    }

    const result = payload.results[0] as ExaContentsResult;
    const content = normalizeText(asOptionalString(result.text) || "");
    if (!content) {
      throw new Error("This page did not return readable content.");
    }

    let finalUrl = requestedUrl;
    const returnedUrl = asOptionalString(result.url);
    if (returnedUrl) {
      try {
        finalUrl = validatePublicHttpUrl(returnedUrl);
      } catch {
        // A provider-returned redirect URL is metadata only. If it does not
        // satisfy our public URL policy, retain the already-validated request URL.
        finalUrl = requestedUrl;
      }
    }

    return {
      content,
      finalUrl,
      title: asOptionalString(result.title),
      author: asOptionalString(result.author),
      publishedDate: asOptionalString(result.publishedDate),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Invalid token" }, 401, corsHeaders);
  }

  if (await isUserBanned(user.id)) {
    return jsonResponse({ error: "Your account has been suspended. Please contact support.", code: "banned" }, 403, corsHeaders);
  }

  let quota: { allowed: boolean; currentCount: number };
  try {
    quota = await consumeDailyImportQuota(user.id);
  } catch (err) {
    console.error("[IMPORT_SOURCE] quota reservation failed", err instanceof Error ? err.message : String(err));
    return jsonResponse({ error: "Unable to verify your quota. Please try again." }, 500, corsHeaders);
  }
  if (!quota.allowed) {
    return jsonResponse({
      error: `You've reached the daily import limit (${DAILY_IMPORT_LIMIT}). Try again tomorrow.`,
      code: "limit_reached",
      limit: DAILY_IMPORT_LIMIT,
      current: quota.currentCount,
    }, 429, corsHeaders);
  }

  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      await logImport(user.id, "error", "bad_request", Date.now() - startedAt);
      return jsonResponse({ error: "Invalid JSON body." }, 400, corsHeaders);
    }

    const requestedUrl = validatePublicHttpUrl(String((body as Record<string, unknown>).url || "").trim());
    const extracted = await extractViaExa(requestedUrl);
    const content = extracted.content;

    if (content.split(/\s+/).filter(Boolean).length < 20) {
      await logImport(user.id, "error", "too_short", Date.now() - startedAt);
      return jsonResponse({ error: "This page did not contain enough readable text to import." }, 422, corsHeaders);
    }

    const title = extracted.title || extracted.finalUrl.pathname.split("/").pop() || extracted.finalUrl.hostname;
    const excerpt = content.slice(0, 220).replace(/\s+\S*$/, "").trim();

    await logImport(user.id, "success", undefined, Date.now() - startedAt);
    return jsonResponse({
      title,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      author: extracted.author,
      publishedDate: extracted.publishedDate,
      domain: extracted.finalUrl.hostname,
      excerpt,
      url: extracted.finalUrl.toString(),
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import source.";
    await logImport(user.id, "error", "exception", Date.now() - startedAt);
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
