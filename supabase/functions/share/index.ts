// Supabase Edge Function: Share API for DebateLab
// Creates and manages shareable links for debate content

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req: Request) => {
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

        // Generate unique share code
        let shareCode = generateShareCode();
        let attempts = 0;
        while (attempts < 5) {
            const { data: existing } = await supabase
                .from("shared_items")
                .select("id")
                .eq("share_code", shareCode)
                .single();

            if (!existing) break;
            shareCode = generateShareCode();
            attempts++;
        }

        // Calculate expiration
        let expiresAt: string | null = null;
        if (expiresInDays && typeof expiresInDays === 'number') {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + expiresInDays);
            expiresAt = expiry.toISOString();
        }

        // Create shared item
        const { data, error } = await supabase
            .from("shared_items")
            .insert({
                share_code: shareCode,
                item_type: itemType,
                item_data: itemData,
                title: title || `Shared ${itemType}`,
                created_by: userId,
                expires_at: expiresAt,
            })
            .select()
            .single();

        if (error) {
            console.error("[SHARE] Insert error:", error);
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
