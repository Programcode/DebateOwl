// Supabase Edge Function: Share API for DebateLab
// Creates and manages shareable links for debate content

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SECURITY: Allow specific origins for CORS
const ALLOWED_ORIGINS = [
    "https://debate.pi-stack.org",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:54321"
];

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

function generateShareCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
    return error?.code === "23505" || Boolean(error?.message?.toLowerCase().includes("duplicate"));
}

Deno.serve(async (req: Request) => {
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

    // Get user from token (optional - anonymous shares allowed)
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        try {
            const token = authHeader.slice(7);
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id || null;
        } catch {
            // Continue as anonymous
        }
    }

    try {
        const body = await req.json();
        const { itemType, itemData, title, expiresInDays } = body;

        if (!itemType || !itemData) {
            return new Response(JSON.stringify({ error: "Missing itemType or itemData" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Validate item type
        const validTypes = ['case', 'attack', 'brainstorm', 'factoids', 'chat', 'sources'];
        if (!validTypes.includes(itemType)) {
            return new Response(JSON.stringify({ error: "Invalid item type" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Calculate expiration
        let expiresAt: string | null = null;
        if (expiresInDays && typeof expiresInDays === 'number') {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + expiresInDays);
            expiresAt = expiry.toISOString();
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
            shareUrl: `${req.headers.get("origin") || "https://debate.pi-stack.org"}/share/${data.share_code}`,
            expiresAt: data.expires_at,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[SHARE API ERROR]", message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
