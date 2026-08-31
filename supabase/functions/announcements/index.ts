// Supabase Edge Function: authenticated announcement delivery and dismissal.

import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { validateAnnouncementId } from "../_shared/announcements.ts";

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:18080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
  "capacitor://localhost",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, userClient } = await requireUser(req);
    const action = new URL(req.url).searchParams.get("action");

    if (req.method === "GET" && action === null) {
      const announcementsResult = await userClient
        .from("admin_announcements")
        .select("id,title,body,starts_at,expires_at,created_at")
        .order("starts_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (announcementsResult.error) {
        console.error("[ANNOUNCEMENTS] Failed to list", announcementsResult.error.code);
        throw new HttpError(500, "Unable to load announcements");
      }

      const activeAnnouncements = announcementsResult.data ?? [];
      if (activeAnnouncements.length === 0) return json({ announcements: [] }, 200, corsHeaders);

      const dismissalsResult = await userClient
        .from("user_announcement_dismissals")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", activeAnnouncements.map((announcement) => announcement.id));

      if (dismissalsResult.error) {
        console.error("[ANNOUNCEMENTS] Failed to list dismissals", dismissalsResult.error.code);
        throw new HttpError(500, "Unable to load announcements");
      }

      const dismissedIds = new Set(
        (dismissalsResult.data ?? []).map((row) => row.announcement_id),
      );
      const announcements = activeAnnouncements.filter(
        (announcement) => !dismissedIds.has(announcement.id),
      );

      return json({ announcements }, 200, corsHeaders);
    }

    if (req.method === "POST" && action === "dismiss") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "Request body must be valid JSON");
      }

      const announcementId = validateAnnouncementId(body);
      if (!announcementId.ok) throw new HttpError(400, announcementId.error);

      const { error } = await userClient
        .from("user_announcement_dismissals")
        .insert({ announcement_id: announcementId.value, user_id: user.id });

      if (error && error.code !== "23505") {
        console.error("[ANNOUNCEMENTS] Failed to dismiss", error.code);
        if (error.code === "42501") {
          throw new HttpError(404, "Announcement is not available");
        }
        throw new HttpError(500, "Unable to dismiss announcement");
      }

      return json({ success: true }, 200, corsHeaders);
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return jsonError(error, corsHeaders);
  }
});
