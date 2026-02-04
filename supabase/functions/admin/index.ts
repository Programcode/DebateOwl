// Supabase Edge Function: Admin API for DebateLab
// Provides usage statistics, rate limit management, and user management

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Authenticate request
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
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

            if (!limitType || typeof limitValue !== "number") {
                return new Response(JSON.stringify({ error: "Invalid limit parameters" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Upsert limit
            const { error } = await supabase
                .from("rate_limits")
                .upsert({
                    user_id: userId || null, // null = global limit
                    limit_type: limitType,
                    limit_value: limitValue,
                }, { onConflict: "user_id,limit_type" });

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

            const { error } = await supabase
                .from("user_roles")
                .upsert({ user_id: userId, role }, { onConflict: "user_id" });

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
