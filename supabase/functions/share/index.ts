// Supabase Edge Function: Share API for DebateLab
// Creates and manages shareable links for debate content

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { PUBLIC_WEB_APP_ORIGIN, getCorsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { BodyTooLargeError, discardRequestBody, readBoundedBody } from "../_shared/bounded-body.ts";

// Shared items are saved text, so 512 KB of JSON leaves room for long cases and
// chats while keeping one request from filling the table.
const MAX_SHARE_BYTES = 512 * 1024;
const DEFAULT_EXPIRES_IN_DAYS = 30;
const MAX_EXPIRES_IN_DAYS = 90;
const DAILY_SHARE_LIMIT = 50;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateShareCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let code = '';
    for (let i = 0; i < bytes.length; i++) {
        code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
}

/** Prefer the caller's allowed origin, then the configured app origin. */
function shareOrigin(req: Request): string {
    const origin = req.headers.get("origin");
    if (origin && isAllowedOrigin(origin)) return origin;
    const referer = req.headers.get("referer");
    if (referer) {
        try {
            const refererOrigin = new URL(referer).origin;
            if (isAllowedOrigin(refererOrigin)) return refererOrigin;
        } catch {
            // A malformed Referer is not an app origin.
        }
    }
    let configured: string | undefined;
    try {
        configured = Deno.env.get("PUBLIC_WEB_APP_ORIGIN")?.trim();
    } catch {
        // The test runner allow-lists env names. An unread optional origin is the constant below.
        configured = undefined;
    }
    if (configured) {
        try {
            const parsed = new URL(configured);
            if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.origin;
        } catch {
            // Fall through to the production origin.
        }
    }
    return PUBLIC_WEB_APP_ORIGIN;
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function consumeDailyShareQuota(userId: string): Promise<{ allowed: boolean; currentCount: number }> {
    const { data, error } = await supabase.rpc("consume_daily_quota", {
        p_user_id: userId,
        p_limit: DAILY_SHARE_LIMIT,
        p_quota_key: "share",
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: Boolean(row?.allowed), currentCount: row?.current_count ?? 0 };
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
    return error?.code === "23505" || Boolean(error?.message?.toLowerCase().includes("duplicate"));
}

export async function handleRequest(req: Request): Promise<Response> {
    const corsHeaders = getCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Creating a share link requires a signed-in user, who becomes its owner.
    let userId: string;
    try {
        userId = (await requireUser(req)).user.id;
    } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        console.warn("[SHARE] Authentication rejected:", error.message);
        await discardRequestBody(req);
        return jsonError(error, corsHeaders);
    }

    try {
        let body: Record<string, unknown>;
        try {
            const parsed = JSON.parse(await readBoundedBody(req, MAX_SHARE_BYTES));
            if (!parsed || typeof parsed !== "object") throw new SyntaxError("not an object");
            body = parsed;
        } catch (error) {
            if (error instanceof BodyTooLargeError) {
                return jsonResponse({ error: "Shared content is too large.", code: "payload_too_large" }, 413, corsHeaders);
            }
            return jsonResponse({ error: "Invalid JSON body." }, 400, corsHeaders);
        }
        const { itemType, itemData, title } = body;

        if (!itemType || !itemData) {
            return jsonResponse({ error: "Missing itemType or itemData" }, 400, corsHeaders);
        }

        // Validate item type
        const validTypes = ['case', 'attack', 'brainstorm', 'factoids', 'chat', 'sources'];
        if (typeof itemType !== "string" || !validTypes.includes(itemType)) {
            return jsonResponse({ error: "Invalid item type" }, 400, corsHeaders);
        }

        // Every share expires. No client sends expiresInDays today; an omitted
        // value gets the default, and an explicit one must be in range.
        const expiresInDays = "expiresInDays" in body ? body.expiresInDays : DEFAULT_EXPIRES_IN_DAYS;
        if (typeof expiresInDays !== "number" || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRES_IN_DAYS) {
            return jsonResponse({ error: `expiresInDays must be a whole number from 1 to ${MAX_EXPIRES_IN_DAYS}.` }, 400, corsHeaders);
        }
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

        let quota: { allowed: boolean; currentCount: number };
        try {
            quota = await consumeDailyShareQuota(userId);
        } catch (err) {
            console.error("[SHARE] quota reservation failed", err instanceof Error ? err.message : String(err));
            return jsonResponse({ error: "Unable to verify your quota. Please try again." }, 500, corsHeaders);
        }
        if (!quota.allowed) {
            return jsonResponse({
                error: `You've reached the daily share limit (${DAILY_SHARE_LIMIT}). Try again tomorrow.`,
                code: "limit_reached",
                limit: DAILY_SHARE_LIMIT,
                current: quota.currentCount,
            }, 429, corsHeaders);
        }

        let data: { share_code: string; expires_at: string | null } | null = null;
        let lastError: { code?: string; message?: string } | null = null;

        for (let attempts = 0; attempts < 5; attempts++) {
            const shareCode = generateShareCode();
            const result = await supabase
                .from("shared_items")
                .insert({
                    share_code: shareCode,
                    item_type: itemType,
                    item_data: itemData,
                    title: title || `Shared ${itemType}`,
                    created_by: userId,
                    expires_at: expiresAt,
                })
                .select("share_code, expires_at")
                .single();

            if (!result.error) {
                data = result.data;
                break;
            }

            lastError = result.error;
            if (!isUniqueViolation(result.error)) {
                break;
            }
            console.warn(`[SHARE] Share code collision, retrying (${attempts + 1}/5)`);
        }

        if (!data) {
            console.error("[SHARE] Insert error:", lastError);
            return new Response(JSON.stringify({ error: "Failed to create share link" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            shareCode: data.share_code,
            shareUrl: `${shareOrigin(req)}/share/${data.share_code}`,
            expiresAt: data.expires_at,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        // The thrown text can be PostgREST or Postgres detail; it stays in the log.
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[SHARE API ERROR]", message.slice(0, 2000));
        return new Response(JSON.stringify({ error: "Failed to create share link" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
