// Supabase Edge Function: Admin API for DebateLab
// Provides usage statistics, rate limit management, and user management

import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import {
    validateAnnouncementId,
    validateCreateAnnouncement,
} from "../_shared/announcements.ts";
import { generateDemoCode, hashDemoCode, isCreatableDemoRole } from "../_shared/demo-code.ts";
import { collectAdminUsagePages, getKnownCost, hasUnknownCost, isNonAiActivity } from "../_shared/admin-cost.ts";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// SECURITY: Allow specific origins for CORS


const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ADMIN_ANNOUNCEMENT_COLUMNS =
    "id,title,body,target_type,target_user_ids,starts_at,expires_at,deactivated_at,created_by,created_at";
const ADMIN_DEMO_CODE_COLUMNS =
    "id,label,email,role,expires_at,max_uses,use_count,created_by,last_used_at,disabled_at,created_at";

type UsageByUserRow = {
    user_id: string;
    email?: string | null;
    requests: number;
    cost: number;
    unknownCostRequests?: number;
};

async function getAuthEmailMap(userIds: string[]): Promise<{ resolved: Map<string, string>; failed: string[] }> {
    const wantedIds = new Set(userIds.filter(Boolean));
    const emails = new Map<string, string>();
    const failed = new Set<string>();
    if (wantedIds.size === 0) return { resolved: emails, failed: [] };

    await Promise.all([...wantedIds].map(async (listedUserId) => {
        const { data, error } = await supabase.auth.admin.getUserById(listedUserId);
        const email = data?.user?.email;
        if (error) {
            console.warn("[ADMIN] Failed to fetch top-user email", listedUserId, error.message);
            failed.add(listedUserId);
            return;
        }
        if (email) emails.set(listedUserId, email);
    }));

    if (emails.size === wantedIds.size) return { resolved: emails, failed: [] };

    for (let page = 1; page <= 10 && emails.size < wantedIds.size; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) {
            console.warn("[ADMIN] Failed to list auth users for top-user emails", error.message);
            break;
        }

        for (const authUser of data?.users || []) {
            if (wantedIds.has(authUser.id) && authUser.email) {
                emails.set(authUser.id, authUser.email);
                failed.delete(authUser.id);
            }
        }

        if (!data?.users || data.users.length < 1000) break;
    }

    const unresolved = [...wantedIds].filter((id) => !emails.has(id));
    unresolved.forEach((id) => failed.add(id));
    return { resolved: emails, failed: [...failed] };
}

async function isAdmin(userId: string): Promise<boolean> {
    const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
    return data?.role === "admin";
}

async function assertCurrentAdmin(userId: string) {
    if (!(await isAdmin(userId))) {
        throw new Error("Admin role no longer active");
    }
}

export async function handleRequest(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin, { methods: "POST, GET, OPTIONS" });

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Authenticate request
    let user: User;
    try {
        user = (await requireUser(req)).user;
    } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        console.warn("[ADMIN] Authentication rejected:", error.message);
        return jsonError(error, corsHeaders);
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
        // GET /admin?action=announcements - List all announcements for admin review
        if (action === "announcements" && req.method === "GET") {
            const { data, error } = await supabase
                .from("admin_announcements")
                .select(ADMIN_ANNOUNCEMENT_COLUMNS)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("[ADMIN] Failed to list announcements", error.code);
                throw new Error("Failed to list announcements");
            }

            return new Response(JSON.stringify({ announcements: data ?? [] }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=create-announcement - Create an all-user or targeted announcement
        if (action === "create-announcement" && req.method === "POST") {
            let body: unknown;
            try {
                body = await req.json();
            } catch {
                return new Response(JSON.stringify({ error: "Request body must be valid JSON" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const validated = validateCreateAnnouncement(body);
            if (!validated.ok) {
                return new Response(JSON.stringify({ error: validated.error }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { value } = validated;
            const { data, error } = await supabase
                .from("admin_announcements")
                .insert({
                    title: value.title,
                    body: value.body,
                    target_type: value.targetType,
                    target_user_ids: value.targetUserIds,
                    starts_at: value.startsAt,
                    expires_at: value.expiresAt,
                    created_by: user.id,
                })
                .select(ADMIN_ANNOUNCEMENT_COLUMNS)
                .single();

            if (error) {
                console.error("[ADMIN] Failed to create announcement", error.code);
                throw new Error("Failed to create announcement");
            }

            return new Response(JSON.stringify({ announcement: data }), {
                status: 201,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=deactivate-announcement - Stop delivery without deleting dismissal history
        if (action === "deactivate-announcement" && req.method === "POST") {
            let body: unknown;
            try {
                body = await req.json();
            } catch {
                return new Response(JSON.stringify({ error: "Request body must be valid JSON" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const announcementId = validateAnnouncementId(body);
            if (!announcementId.ok) {
                return new Response(JSON.stringify({ error: announcementId.error }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { data, error } = await supabase
                .from("admin_announcements")
                .update({ deactivated_at: new Date().toISOString() })
                .eq("id", announcementId.value)
                .is("deactivated_at", null)
                .select(ADMIN_ANNOUNCEMENT_COLUMNS)
                .maybeSingle();

            if (error) {
                console.error("[ADMIN] Failed to deactivate announcement", error.code);
                throw new Error("Failed to deactivate announcement");
            }
            if (!data) {
                return new Response(JSON.stringify({ error: "Active announcement not found" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ announcement: data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=delete-announcement - Remove an announcement and its dismissals
        if (action === "delete-announcement" && req.method === "POST") {
            let body: unknown;
            try {
                body = await req.json();
            } catch {
                return new Response(JSON.stringify({ error: "Request body must be valid JSON" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const announcementId = validateAnnouncementId(body);
            if (!announcementId.ok) {
                return new Response(JSON.stringify({ error: announcementId.error }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { data, error } = await supabase
                .from("admin_announcements")
                .delete()
                .eq("id", announcementId.value)
                .select("id")
                .maybeSingle();

            if (error) {
                console.error("[ADMIN] Failed to delete announcement", error.code);
                throw new Error("Failed to delete announcement");
            }
            if (!data) {
                return new Response(JSON.stringify({ error: "Announcement not found" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=stats - Get usage statistics
        if (action === "stats") {
            const days = parseInt(url.searchParams.get("days") || "7");
            const since = new Date();
            since.setDate(since.getDate() - days);

            // Total requests and cost
            const usageRows = await collectAdminUsagePages(async (from, to) => {
                const { data, error } = await supabase
                    .from("ai_requests")
                    .select("id, user_id, feature, provider, model, cost_usd, input_tokens, output_tokens, status, created_at")
                    .gte("created_at", since.toISOString())
                    .order("created_at", { ascending: true })
                    .order("id", { ascending: true })
                    .range(from, to);
                return { data, error };
            });
            const totalRequests = usageRows.length;
            const totalCost = usageRows.reduce((sum, r) => sum + getKnownCost(r), 0);
            // "Unknown cost" means a provider request we cannot price. Rows
            // that never reached a provider (rate_limited) are not cost data
            // gaps and must not inflate the unknown count.
            const unknownCostRequests = usageRows.filter((r) => hasUnknownCost(r)).length;
            const successRate = usageRows.length
                ? (usageRows.filter(r => r.status === "success").length / usageRows.length) * 100
                : 100;

            // By model: known cost summed per model plus unknown-cost request counts.
            const modelAggregates = new Map<string, { provider: string; model: string; requests: number; cost: number; unknownCostRequests: number }>();
            usageRows.forEach((r) => {
                if (isNonAiActivity(r)) return;
                const key = `${r.provider}/${r.model}`;
                const entry = modelAggregates.get(key) || { provider: r.provider, model: r.model, requests: 0, cost: 0, unknownCostRequests: 0 };
                entry.requests += 1;
                entry.cost += getKnownCost(r);
                if (hasUnknownCost(r)) entry.unknownCostRequests += 1;
                modelAggregates.set(key, entry);
            });
            const byModel = Array.from(modelAggregates.values()).sort((a, b) => b.requests - a.requests);

            // Daily breakdown
            const dailyAggregates = new Map<string, { date: string; requests: number; cost: number; errors: number }>();
            usageRows.forEach((r) => {
                const date = typeof r.created_at === "string" ? r.created_at.slice(0, 10) : "";
                if (!date) return;
                const entry = dailyAggregates.get(date) || { date, requests: 0, cost: 0, errors: 0 };
                entry.requests += 1;
                entry.cost += getKnownCost(r);
                if (r.status !== "success") entry.errors += 1;
                dailyAggregates.set(date, entry);
            });
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const daily = Array.from(dailyAggregates.values())
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((row) => ({
                    ...row,
                    date: `${months[Number(row.date.slice(5, 7)) - 1] || row.date.slice(5, 7)} ${row.date.slice(8, 10)}`,
                }));

            // By feature
            const featureCounts: Record<string, number> = {};
            const featureAggregates = new Map<string, { feature: string; requests: number; cost: number; unknownCostRequests: number }>();
            usageRows.forEach(r => {
                featureCounts[r.feature] = (featureCounts[r.feature] || 0) + 1;
                if (isNonAiActivity(r)) return;
                const entry = featureAggregates.get(r.feature) || { feature: r.feature, requests: 0, cost: 0, unknownCostRequests: 0 };
                entry.requests += 1;
                entry.cost += getKnownCost(r);
                if (hasUnknownCost(r)) entry.unknownCostRequests += 1;
                featureAggregates.set(r.feature, entry);
            });
            const byFeatureCost = Array.from(featureAggregates.values()).sort((a, b) => b.requests - a.requests);

            // By user (top 10)
            const userAggregates = new Map<string, UsageByUserRow>();
            usageRows.forEach((r) => {
                if (!r.user_id) return;
                const entry = userAggregates.get(r.user_id) || { user_id: r.user_id, requests: 0, cost: 0, unknownCostRequests: 0 };
                entry.requests += 1;
                entry.cost += getKnownCost(r);
                if (hasUnknownCost(r)) entry.unknownCostRequests = (entry.unknownCostRequests || 0) + 1;
                userAggregates.set(r.user_id, entry);
            });
            const byUser = Array.from(userAggregates.values())
                .sort((a, b) => b.requests - a.requests)
                .slice(0, 10);
            const missingEmailUserIds = byUser
                .filter((row) => !row.email)
                .map((row) => row.user_id)
                .filter(Boolean);
            const userEmails = await getAuthEmailMap(missingEmailUserIds);

            const byUserWithEmail = byUser.map((row) => ({
                ...row,
                email: row.email || userEmails.resolved.get(row.user_id) || null,
            }));

            return new Response(JSON.stringify({
                totals: { requests: totalRequests, cost: totalCost, successRate, unknownCostRequests },
                daily: daily || [],
                byFeature: featureCounts,
                byFeatureCost,
                byModel,
                byUser: byUserWithEmail,
                emailLookupFailures: userEmails.failed.length,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=users - One page of users with usage.
        // GoTrue's default page is 50; the client asks for the next page.
        if (action === "users") {
            const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
            const perPageRaw = Number.parseInt(url.searchParams.get("perPage") ?? "50", 10);
            const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 10_000) : 1;
            const perPage = Number.isFinite(perPageRaw) && perPageRaw >= 1 ? Math.min(perPageRaw, 100) : 50;
            const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
            if (listError) throw listError;
            const pageUsers = listed?.users ?? [];
            const hasMore = listed && "nextPage" in listed
                ? listed.nextPage != null
                : pageUsers.length === perPage;

            // Get usage counts for each user
            const enrichedUsers = await Promise.all(
                pageUsers.map(async (u) => {
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
                        .maybeSingle();

                    const { data: settings } = await supabase
                        .from("user_settings")
                        .select("subscription_tier, trial_ends_at, grace_period_ends_at, daily_limit_override")
                        .eq("user_id", u.id)
                        .maybeSingle();

                    return {
                        id: u.id,
                        email: u.email,
                        createdAt: u.created_at,
                        lastSignIn: u.last_sign_in_at,
                        requestCount: count || 0,
                        limits: limits || [],
                        role: role?.role || "user",
                        subscriptionTier: settings?.subscription_tier || null,
                        trialEndsAt: settings?.trial_ends_at || null,
                        gracePeriodEndsAt: settings?.grace_period_ends_at || null,
                        dailyLimitOverride: settings?.daily_limit_override ?? null,
                    };
                })
            );

            return new Response(JSON.stringify({ users: enrichedUsers, page, perPage, hasMore }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=demo-codes - List demo codes without hashes or raw codes
        if (action === "demo-codes" && req.method === "GET") {
            await assertCurrentAdmin(user.id);
            const { data, error } = await supabase
                .from("demo_access_codes")
                .select(ADMIN_DEMO_CODE_COLUMNS)
                .order("created_at", { ascending: false });

            if (error) throw error;

            return new Response(JSON.stringify({ codes: data || [] }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=create-demo-code - Create a code and return its raw value once
        if (action === "create-demo-code" && req.method === "POST") {
            await assertCurrentAdmin(user.id);
            const body = await req.json().catch(() => ({}));
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                return new Response(JSON.stringify({ error: "Request body must be a JSON object" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const label = typeof body.label === "string" ? body.label.trim() : "";
            const requestedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
            const role = body.role ?? "user";
            const rawMaxUses = body.maxUses;
            const rawExpiresAt = body.expiresAt;

            if (!label || label.length > 120) {
                return new Response(JSON.stringify({ error: "Label is required and must be 120 characters or fewer" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            if (requestedEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail) || requestedEmail.length > 254)) {
                return new Response(JSON.stringify({ error: "Invalid demo email" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Self-service demo codes always provision an ordinary user.
            if (!isCreatableDemoRole(role)) {
                return new Response(JSON.stringify({ error: "Demo codes may only use the user role" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            let maxUses: number | null = null;
            if (rawMaxUses !== undefined && rawMaxUses !== null && rawMaxUses !== "") {
                maxUses = Number(rawMaxUses);
                if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000) {
                    return new Response(JSON.stringify({ error: "Max uses must be a positive integer" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
            }

            let expiresAt: string | null = null;
            if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== "") {
                const parsedExpiresAt = new Date(rawExpiresAt);
                if (typeof rawExpiresAt !== "string" || Number.isNaN(parsedExpiresAt.getTime()) || parsedExpiresAt.getTime() <= Date.now()) {
                    return new Response(JSON.stringify({ error: "Expiry must be a future date" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                expiresAt = parsedExpiresAt.toISOString();
            }

            const { data: duplicateEmail, error: duplicateError } = requestedEmail
                ? await supabase.from("demo_access_codes").select("id").eq("email", requestedEmail).maybeSingle()
                : { data: null, error: null };
            if (duplicateError) throw duplicateError;
            if (duplicateEmail) {
                return new Response(JSON.stringify({ error: "A demo code already uses that email" }), {
                    status: 409,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            let rawCode = "";
            let createdCode: Record<string, unknown> | null = null;
            for (let attempt = 0; attempt < 5 && !createdCode; attempt += 1) {
                rawCode = generateDemoCode();
                const codeHash = await hashDemoCode(rawCode);
                const email = requestedEmail || `demo-${crypto.randomUUID()}@debate.pi-stack.org`;
                const { data, error } = await supabase
                    .from("demo_access_codes")
                    .insert({
                        code_hash: codeHash,
                        label,
                        email,
                        role,
                        expires_at: expiresAt,
                        max_uses: maxUses,
                        created_by: user.id,
                    })
                    .select(ADMIN_DEMO_CODE_COLUMNS)
                    .single();

                if (!error) {
                    createdCode = data;
                    break;
                }
                if (error.code !== "23505") throw error;
            }

            if (!createdCode) throw new Error("Could not create demo code");

            return new Response(JSON.stringify({ code: rawCode, demoCode: createdCode }), {
                status: 201,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=disable-demo-code - Disable a code without deleting its audit data
        if (action === "disable-demo-code" && req.method === "POST") {
            await assertCurrentAdmin(user.id);
            const body = await req.json().catch(() => ({}));
            const id = typeof body.id === "string" ? body.id.trim() : "";
            if (!id) {
                return new Response(JSON.stringify({ error: "Demo code ID is required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { data, error } = await supabase
                .from("demo_access_codes")
                .update({ disabled_at: new Date().toISOString() })
                .eq("id", id)
                .select(ADMIN_DEMO_CODE_COLUMNS)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                return new Response(JSON.stringify({ error: "Demo code not found" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ demoCode: data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=reset-demo-code - Reset usage while preserving the code's status
        if (action === "reset-demo-code" && req.method === "POST") {
            await assertCurrentAdmin(user.id);
            const body = await req.json().catch(() => ({}));
            const id = typeof body.id === "string" ? body.id.trim() : "";
            if (!id) {
                return new Response(JSON.stringify({ error: "Demo code ID is required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { data, error } = await supabase
                .from("demo_access_codes")
                .update({ use_count: 0, last_used_at: null })
                .eq("id", id)
                .select(ADMIN_DEMO_CODE_COLUMNS)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                return new Response(JSON.stringify({ error: "Demo code not found" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ demoCode: data }), {
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
            await assertCurrentAdmin(user.id);

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
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
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

            await assertCurrentAdmin(user.id);
            const { error } = await supabase
                .from("user_roles")
                .upsert({
                    user_id: userId,
                    role,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "user_id" });

            if (error) {
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST /admin?action=grant-trial - Gift a trial / pro extension to a user
        if (action === "grant-trial" && req.method === "POST") {
            const body = await req.json();
            const { userId, days = 30, dailyLimit, notes } = body as {
                userId?: string;
                days?: number;
                dailyLimit?: number;
                notes?: string;
            };

            if (!userId || !Number.isInteger(days) || days < 1 || days > 365) {
                return new Response(JSON.stringify({ error: "Invalid grant parameters" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { data: targetUser, error: targetError } = await supabase.auth.admin.getUserById(userId);
            if (targetError || !targetUser?.user) {
                return new Response(JSON.stringify({ error: "Target user not found" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const now = new Date();
            const trialEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

            const updatePayload: Record<string, unknown> = {
                user_id: userId,
                subscription_tier: "trial",
                trial_ends_at: trialEndsAt.toISOString(),
                grace_period_ends_at: null,
            };
            if (Number.isInteger(dailyLimit) && (dailyLimit as number) > 0) {
                updatePayload.daily_limit_override = dailyLimit;
            }

            await assertCurrentAdmin(user.id);
            const { error: updateError } = await supabase
                .from("user_settings")
                .upsert(updatePayload, { onConflict: "user_id" });

            if (updateError) {
                console.error("[ADMIN] Database operation failed:", updateError.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error: auditError } = await supabase
                .from("admin_grants")
                .insert({
                    admin_user_id: user.id,
                    target_user_id: userId,
                    grant_type: "trial",
                    starts_at: now.toISOString(),
                    ends_at: trialEndsAt.toISOString(),
                    notes: notes || null,
                });

            if (auditError) {
                console.warn("[ADMIN] grant-trial audit insert failed", auditError.message);
            }

            return new Response(JSON.stringify({
                success: true,
                user_id: userId,
                subscription_tier: "trial",
                trial_ends_at: trialEndsAt.toISOString(),
                daily_limit_override: updatePayload.daily_limit_override ?? null,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // GET /admin?action=limits - Get deduplicated rate limits (most recent per type)
        if (action === "limits") {
            const { data, error } = await supabase.rpc("get_active_rate_limits");

            if (error) {
                console.warn("[ADMIN] get_active_rate_limits failed:", error.message);
                // Same column set the RPC returns. updated_at is not on this table.
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from("rate_limits")
                    .select("id, user_id, limit_type, limit_value, created_at")
                    .order("created_at", { ascending: false });
                if (fallbackError) console.warn("[ADMIN] rate_limits lookup failed:", fallbackError.message);

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

            await assertCurrentAdmin(user.id);
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
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
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

            await assertCurrentAdmin(user.id);
            const { error } = await supabase
                .from("global_prompts")
                .delete()
                .eq("feature", feature);

            if (error) {
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
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

            await assertCurrentAdmin(user.id);
            const { error } = await supabase.from("promo_codes").insert({
                code: code.toUpperCase(),
                type,
                config: config || {},
                max_redemptions: maxRedemptions || null,
                created_by: user.id,
            });

            if (error) {
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
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

            await assertCurrentAdmin(user.id);
            const { error } = await supabase.from("promo_codes").update({
                is_active: isActive,
            }).eq("id", id);

            if (error) {
                console.error("[ADMIN] Database operation failed:", error.message.slice(0, 2000));
                return new Response(JSON.stringify({ error: "Internal server error" }), {
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
        console.error("[ADMIN API ERROR]", message.slice(0, 2000));
        if (message === "Admin role no longer active") {
            return new Response(JSON.stringify({ error: message }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
