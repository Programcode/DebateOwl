// Supabase Edge Function: Admin API for DebateLab
// Provides usage statistics, rate limit management, and user management

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
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function isAdmin(userId: string): Promise<boolean> {
    const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();
    return data?.role === "admin";
}

Deno.serve(async (req) => {
    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Authenticate request
    const authHeader = req.headers.get("authorization");
    console.log("[ADMIN] Auth header present:", !!authHeader, "starts with Bearer:", authHeader?.startsWith("Bearer "));
    if (!authHeader?.startsWith("Bearer ")) {
        console.log("[ADMIN] No auth header, returning 401");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const token = authHeader.slice(7);
    console.log("[ADMIN] Token length:", token.length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    console.log("[ADMIN] getUser result - user:", user?.id, "error:", authError?.message);
    if (authError || !user) {
        console.log("[ADMIN] Auth failed, returning 401");
        return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Check if user is admin
    const admin = await isAdmin(user.id);
    if (!admin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    try {
        // GET /admin?action=stats - Get usage statistics
        if (action === "stats") {
            const days = parseInt(url.searchParams.get("days") || "7");
            const since = new Date();
            since.setDate(since.getDate() - days);

            // Total requests and cost
            const { data: totals } = await supabase
                .from("ai_requests")
                .select("id, cost_usd, status")
                .gte("created_at", since.toISOString());

            const totalRequests = totals?.length || 0;
            const totalCost = totals?.reduce((sum, r) => sum + (r.cost_usd || 0), 0) || 0;
            const successRate = totals?.length
                ? (totals.filter(r => r.status === "success").length / totals.length) * 100
                : 100;

            // Daily breakdown
            const { data: daily } = await supabase.rpc("get_daily_usage", { days_back: days });

            // By feature
            const { data: byFeature } = await supabase
                .from("ai_requests")
                .select("feature")
                .gte("created_at", since.toISOString());

            const featureCounts: Record<string, number> = {};
            byFeature?.forEach(r => {
                featureCounts[r.feature] = (featureCounts[r.feature] || 0) + 1;
            });

            // By user (top 10)
            const { data: byUser } = await supabase.rpc("get_usage_by_user", { days_back: days, limit_count: 10 });

            return new Response(JSON.stringify({
                totals: { requests: totalRequests, cost: totalCost, successRate },
                daily: daily || [],
                byFeature: featureCounts,
                byUser: byUser || [],
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=users - List users with usage
        if (action === "users") {
            const { data: users } = await supabase.auth.admin.listUsers();

            // Get usage counts for each user
            const enrichedUsers = await Promise.all(
                (users?.users || []).slice(0, 100).map(async (u) => {
                    const { count } = await supabase
                        .from("ai_requests")
                        .select("*", { count: "exact", head: true })
                        .eq("user_id", u.id);

                    const { data: limits } = await supabase
                        .from("rate_limits")
                        .select("limit_type, limit_value")
                        .eq("user_id", u.id);

                    const { data: role } = await supabase
                        .from("user_roles")
                        .select("role")
                        .eq("user_id", u.id)
                        .single();

                    return {
                        id: u.id,
                        email: u.email,
                        createdAt: u.created_at,
                        lastSignIn: u.last_sign_in_at,
                        requestCount: count || 0,
                        limits: limits || [],
                        role: role?.role || "user",
                    };
                })
            );

            return new Response(JSON.stringify({ users: enrichedUsers }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=set-limit - Set rate limit
        if (action === "set-limit" && req.method === "POST") {
            const body = await req.json();
            const { userId, limitType, limitValue } = body;

            if (!limitType || !Number.isInteger(limitValue) || limitValue < 0) {
                return new Response(JSON.stringify({ error: "Invalid limit parameters" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            let error;
            const payload = {
                user_id: userId || null,
                limit_type: limitType,
                limit_value: limitValue,
                updated_at: new Date().toISOString(),
            };

            if (userId) {
                ({ error } = await supabase
                    .from("rate_limits")
                    .upsert(payload, { onConflict: "user_id,limit_type" }));
            } else {
                const { data: existing } = await supabase
                    .from("rate_limits")
                    .select("id")
                    .is("user_id", null)
                    .eq("limit_type", limitType)
                    .order("updated_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                ({ error } = existing
                    ? await supabase.from("rate_limits").update(payload).eq("id", existing.id)
                    : await supabase.from("rate_limits").insert(payload));
            }

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=set-role - Set user role
        if (action === "set-role" && req.method === "POST") {
            const body = await req.json();
            const { userId, role } = body;

            if (!userId || !["user", "admin", "banned"].includes(role)) {
                return new Response(JSON.stringify({ error: "Invalid role parameters" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            if (userId === user.id && role !== "admin") {
                return new Response(JSON.stringify({ error: "Admins cannot remove or ban their own admin account" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase
                .from("user_roles")
                .upsert({
                    user_id: userId,
                    role,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "user_id" });

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=limits - Get deduplicated rate limits (most recent per type)
        if (action === "limits") {
            const { data, error } = await supabase.rpc("get_active_rate_limits");

            if (error) {
                // Fallback to direct query if RPC doesn't exist yet
                const { data: fallbackData } = await supabase
                    .from("rate_limits")
                    .select("*")
                    .order("updated_at", { ascending: false });

                return new Response(JSON.stringify({ limits: fallbackData || [] }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ limits: data || [] }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=global-prompts - Get all global prompts
        if (action === "global-prompts") {
            const { data } = await supabase
                .from("global_prompts")
                .select("*")
                .order("feature");

            return new Response(JSON.stringify({ prompts: data || [] }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=set-prompt - Set a global prompt
        if (action === "set-prompt" && req.method === "POST") {
            const body = await req.json();
            const { feature, promptText, isActive } = body;

            if (!feature || typeof promptText !== "string") {
                return new Response(JSON.stringify({ error: "Invalid prompt parameters" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const validFeatures = ["generate", "attack", "brainstorm", "factoids", "ask", "all"];
            if (!validFeatures.includes(feature)) {
                return new Response(JSON.stringify({ error: "Invalid feature type" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase
                .from("global_prompts")
                .upsert({
                    feature,
                    prompt_text: promptText,
                    is_active: isActive !== false,
                    created_by: user.id,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "feature" });

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // DELETE /admin?action=delete-prompt - Delete a global prompt
        if (action === "delete-prompt" && req.method === "POST") {
            const body = await req.json();
            const { feature } = body;

            if (!feature) {
                return new Response(JSON.stringify({ error: "Feature is required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase
                .from("global_prompts")
                .delete()
                .eq("feature", feature);

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=promo-codes - List all promo codes
        if (action === "promo-codes") {
            const { data } = await supabase
                .from("promo_codes")
                .select("*")
                .order("created_at", { ascending: false });

            return new Response(JSON.stringify({ codes: data || [] }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=create-promo - Create a promo code
        if (action === "create-promo" && req.method === "POST") {
            const body = await req.json();
            const { code, type, config, maxRedemptions } = body;

            if (!code || !type) {
                return new Response(JSON.stringify({ error: "Code and type are required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const validTypes = ["extended_trial", "extra_limit", "discount", "free_month", "lifetime_pro"];
            if (!validTypes.includes(type)) {
                return new Response(JSON.stringify({ error: "Invalid promo type" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase.from("promo_codes").insert({
                code: code.toUpperCase(),
                type,
                config: config || {},
                max_redemptions: maxRedemptions || null,
                created_by: user.id,
            });

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=toggle-promo - Enable/disable a promo code
        if (action === "toggle-promo" && req.method === "POST") {
            const body = await req.json();
            const { id, isActive } = body;

            if (!id) {
                return new Response(JSON.stringify({ error: "Promo code ID is required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase.from("promo_codes").update({
                is_active: isActive,
            }).eq("id", id);

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=subscribers - List all subscribers with tier info
        if (action === "subscribers") {
            const { data: settings } = await supabase
                .from("user_settings")
                .select("user_id, subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at");

            const { data: subs } = await supabase
                .from("subscriptions")
                .select("user_id, stripe_customer_id, status, current_period_end");

            const { data: authUsers } = await supabase.auth.admin.listUsers();
            const emailMap = new Map<string, string>();
            authUsers?.users?.forEach(u => emailMap.set(u.id, u.email || "unknown"));

            const subMap = new Map<string, { stripe_customer_id: string; status: string; current_period_end: string }>();
            subs?.forEach(s => subMap.set(s.user_id, s));

            const subscribers = (settings || []).map(s => {
                const sub = subMap.get(s.user_id);
                return {
                    user_id: s.user_id,
                    email: emailMap.get(s.user_id) || "unknown",
                    subscription_tier: s.subscription_tier || "trial",
                    stripe_customer_id: sub?.stripe_customer_id || null,
                    status: sub?.status || null,
                    current_period_end: sub?.current_period_end || null,
                };
            });

            return new Response(JSON.stringify({ subscribers }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[ADMIN API ERROR]", message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
