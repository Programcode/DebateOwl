import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl, validateResolvedPublicHost } from "./url-validation.ts";
import { readBoundedText } from "./resource-limits.ts";
import { getMeta, getTitle, stripHtml } from "./html-text.ts";
import { BodyTooLargeError, discardRequestBody, readBoundedBody, untilAborted } from "../_shared/bounded-body.ts";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Re-export helpers so existing callers (if any) keep working.
export { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl };


const MAX_CONTENT_CHARS = 50_000;
// Total time for the request body, DNS, redirects and the whole source body.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_REQUEST_BYTES = 16_384;
const DAILY_IMPORT_LIMIT = 50;


const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
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
    p_quota_key: "import_source",
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
      provider: "url",
      model: "url-import",
      latency_ms: latencyMs,
      status,
      error_code: errorCode,
    });
  } catch (err) {
    console.warn("[IMPORT_SOURCE] logImport failed", err instanceof Error ? err.message : String(err));
  }
}

class SourceTimeoutError extends Error {
  constructor() {
    super("The source took too long to respond.");
  }
}

// The caller's signal is the import's one deadline: it covers DNS, every
// redirect hop and the body read that follows.
async function fetchWithRedirects(initialUrl: URL, signal: AbortSignal) {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await validateResolvedPublicHost(currentUrl, signal);
    const response = await untilAborted(fetch(currentUrl.toString(), {
      headers: {
        "Accept": "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
        "User-Agent": "DebateLabSourceImporter/1.0",
      },
      signal,
      redirect: "manual",
    }), signal);

    // Manual redirect handling so we can re-validate against SSRF on every hop.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect without Location header.");
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects.");
      }
      const nextUrl = new URL(location, currentUrl);
      currentUrl = validatePublicHttpUrl(nextUrl.toString());
      continue;
    }

    return { response, finalUrl: currentUrl };
  }
  throw new Error("Too many redirects.");
}

const UI_PHRASE_PATTERNS = [
  /^skip to (?:main )?content\b/i,
  /^skip to navigation\b/i,
  /^jump to (?:main )?content\b/i,
  /^site search\b/i,
  /^search\.{3}$/i,
  /^watch live\b/i,
  /^sign in\b/i,
  /^sign up\b/i,
  /^subscribe\b/i,
  /^accept (?:all )?cookies\b/i,
  /^manage cookies\b/i,
  /^cookie (?:settings|policy|preferences)\b/i,
  /^menu\b/i,
  /^toggle (?:menu|navigation)\b/i,
  /^close menu\b/i,
  /^advertisement\b/i,
];

function stripLeadingUiPhrases(text: string) {
  let result = text;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = result.replace(/^[\s\n\r]+/, "");
    for (const pattern of UI_PHRASE_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        result = trimmed.slice(match[0].length);
        changed = true;
        break;
      }
    }
    if (!changed && trimmed !== result) {
      result = trimmed;
    }
  }
  return result;
}

function normalizeText(text: string) {
  return stripLeadingUiPhrases(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

export async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  let user: User;
  try {
    user = (await requireUser(req)).user;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    console.warn("[IMPORT_SOURCE] Authentication rejected:", error.message);
    await discardRequestBody(req);
    return jsonError(error, corsHeaders);
  }

  if (await isUserBanned(user.id)) {
    return jsonResponse({ error: "Your account has been suspended. Please contact support.", code: "banned" }, 403, corsHeaders);
  }

  const startedAt = Date.now();
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(new SourceTimeoutError()), FETCH_TIMEOUT_MS);
  try {
    let body: { url?: unknown } | null = null;
    try {
      body = JSON.parse(await readBoundedBody(req, MAX_REQUEST_BYTES, deadline.signal));
    } catch (error) {
      if (deadline.signal.aborted) {
        await logImport(user.id, "error", "request_timeout", Date.now() - startedAt);
        return jsonResponse({ error: "The request took too long to arrive." }, 408, corsHeaders);
      }
      if (error instanceof BodyTooLargeError) {
        await logImport(user.id, "error", "bad_request", Date.now() - startedAt);
        return jsonResponse({ error: "Request body is too large." }, 413, corsHeaders);
      }
    }
    if (!body || typeof body !== "object") {
      await logImport(user.id, "error", "bad_request", Date.now() - startedAt);
      return jsonResponse({ error: "Invalid JSON body." }, 400, corsHeaders);
    }
    if (typeof body.url !== "string") throw new Error("Enter a valid URL.");
    const parsedUrl = validatePublicHttpUrl(body.url.trim());
    await validateResolvedPublicHost(parsedUrl, deadline.signal);

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

    const { response, finalUrl } = await fetchWithRedirects(parsedUrl, deadline.signal);

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      await logImport(user.id, "error", `upstream_${response.status}`, Date.now() - startedAt);
      return jsonResponse({ error: `Could not fetch source (${response.status}).` }, 502, corsHeaders);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) {
      await response.body?.cancel().catch(() => undefined);
      await logImport(user.id, "error", "unsupported_type", Date.now() - startedAt);
      return jsonResponse({ error: "Only HTML and plain text pages can be imported from a URL." }, 415, corsHeaders);
    }

    const raw = await readBoundedText(response, deadline.signal);
    const isHtml = contentType.includes("html") || /<html|<article|<main|<p[\s>]/i.test(raw);
    const content = normalizeText(isHtml ? stripHtml(raw) : raw);

    if (content.split(/\s+/).filter(Boolean).length < 20) {
      await logImport(user.id, "error", "too_short", Date.now() - startedAt);
      return jsonResponse({ error: "This page did not contain enough readable text to import." }, 422, corsHeaders);
    }

    const title = isHtml ? getTitle(raw, finalUrl.hostname) : finalUrl.pathname.split("/").pop() || finalUrl.hostname;
    const author = isHtml ? getMeta(raw, ["author", "article:author"]) : undefined;
    const publishedDate = isHtml ? getMeta(raw, ["article:published_time", "date", "dc.date", "pubdate"]) : undefined;
    const excerpt = content.slice(0, 220).replace(/\s+\S*$/, "").trim();

    await logImport(user.id, "success", undefined, Date.now() - startedAt);
    return jsonResponse({
      title,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      author,
      publishedDate,
      domain: finalUrl.hostname,
      excerpt,
      url: finalUrl.toString(),
    }, 200, corsHeaders);
  } catch (error) {
    if (deadline.signal.aborted) {
      await logImport(user.id, "error", "timeout", Date.now() - startedAt);
      return jsonResponse({ error: new SourceTimeoutError().message }, 504, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Failed to import source.";
    await logImport(user.id, "error", "exception", Date.now() - startedAt);
    return jsonResponse({ error: message }, 400, corsHeaders);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
