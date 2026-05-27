import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl } from "./url-validation.ts";

// Re-export helpers so existing callers (if any) keep working.
export { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl };

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
];

const MAX_CONTENT_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const DAILY_IMPORT_LIMIT = 50;

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

async function countTodaysImports(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", "import_source")
    .gte("created_at", startOfDay.toISOString());
  return count ?? 0;
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

async function fetchWithTimeout(initialUrl: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(currentUrl.toString(), {
        headers: {
          "Accept": "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
          "User-Agent": "DebateLabSourceImporter/1.0",
        },
        signal: controller.signal,
        redirect: "manual",
      });

      // Manual redirect handling so we can re-validate against SSRF on every hop.
      if (response.status >= 300 && response.status < 400) {
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
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function getMeta(html: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const reversePattern = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["'][^>]*>`, "i");
    const match = html.match(pattern) || html.match(reversePattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return undefined;
}

function getTitle(html: string, fallback: string) {
  return getMeta(html, ["og:title", "twitter:title"]) ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "") ||
    fallback;
}

function stripHtml(html: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|header|aside|form|svg|iframe|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(div|section)[^>]*role=["'](banner|navigation|complementary|search|contentinfo)["'][\s\S]*?<\/\1>/gi, " ")
    .replace(/<(div|section)[^>]*(?:id|class)=["'][^"']*(?:cookie|consent|banner|nav(?:bar|igation)?|menu|sidebar|header|footer|subscribe|newsletter|social|share|paywall)[^"']*["'][\s\S]*?<\/\1>/gi, " ");

  const candidates: string[] = [];
  const blockPattern = /<(article|main|section|div)[^>]*(?:id|class)=["'][^"']*(?:article|content|story|post|entry|main|body|reader)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of cleaned.matchAll(blockPattern)) {
    if (match[2]) candidates.push(match[2]);
  }
  const semanticMatch = cleaned.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (semanticMatch?.[2]) candidates.push(semanticMatch[2]);
  candidates.push(cleaned);

  const textCandidates = candidates
    .map((candidate) => htmlToText(candidate))
    .filter((text) => text.split(/\s+/).filter(Boolean).length >= 20);

  return textCandidates.sort((a, b) => scoreReadableText(b) - scoreReadableText(a))[0] || htmlToText(cleaned);
}

function htmlToText(html: string) {
  return decodeEntities(html
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function scoreReadableText(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().split(/\s+/).length >= 12).length;
  const punctuation = (text.match(/[.!?]/g) || []).length;
  const navPenalty = (text.match(/\b(cookie|subscribe|sign in|advertisement|privacy policy|all rights reserved)\b/gi) || []).length * 30;
  return words + paragraphs * 80 + punctuation * 4 - navPenalty;
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

  const todaysImports = await countTodaysImports(user.id);
  if (todaysImports >= DAILY_IMPORT_LIMIT) {
    return jsonResponse({
      error: `You've reached the daily import limit (${DAILY_IMPORT_LIMIT}). Try again tomorrow.`,
      code: "limit_reached",
      limit: DAILY_IMPORT_LIMIT,
      current: todaysImports,
    }, 429, corsHeaders);
  }

  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      await logImport(user.id, "error", "bad_request", Date.now() - startedAt);
      return jsonResponse({ error: "Invalid JSON body." }, 400, corsHeaders);
    }
    const parsedUrl = validatePublicHttpUrl(String(body.url || "").trim());
    const { response, finalUrl } = await fetchWithTimeout(parsedUrl);

    if (!response.ok) {
      await logImport(user.id, "error", `upstream_${response.status}`, Date.now() - startedAt);
      return jsonResponse({ error: `Could not fetch source (${response.status}).` }, 502, corsHeaders);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) {
      await logImport(user.id, "error", "unsupported_type", Date.now() - startedAt);
      return jsonResponse({ error: "Only HTML and plain text pages can be imported from a URL." }, 415, corsHeaders);
    }

    const raw = await response.text();
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
    const message = error instanceof Error ? error.message : "Failed to import source.";
    await logImport(user.id, "error", "exception", Date.now() - startedAt);
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
