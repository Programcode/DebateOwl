// Supabase Edge Function: the spoken opponent for Sparring and Crossfire.
//
// The browser sends one signed segment of opponent speech and gets audio back.
// The ElevenLabs key never leaves this function. It speaks only text the ai
// function wrote for this user, inside a per-user daily cap, and records each
// request in ai_requests. Every failure returns a JSON error with a code so
// the browser can fall back to its own voice and keep the round going.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ELEVENLABS_PROVIDER, normalizeElevenLabsUsage } from "../_shared/cost.ts";
import {
  checkUserBanned,
  getConfiguredDailyLimit,
  getSubscriptionInfo,
  logUsage,
} from "../_shared/entitlements.ts";
import { MAX_VOICE_SEGMENT_CHARS } from "../_shared/voice-tags.ts";
import { isVoiceFeature, verifyVoiceToken, type VoiceFeature } from "../_shared/voice-token.ts";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io";
// "George", the premade voice the ElevenLabs quickstart uses with eleven_v4.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
// Below the browser's own 30-second wait, so a slow clip ends here with an
// error the browser acts on rather than being paid for and then discarded.
const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_REQUEST_BODY_BYTES = 8_000;

// Full-quality v4 for prepared speeches; Turbo for the quick exchanges of
// Crossfire, where latency matters more than polish.
export const VOICE_MODELS: Record<VoiceFeature, string> = {
  sparring: "eleven_v4",
  crossfire: "eleven_v4_turbo",
};

// Daily clips per user. A clip is one request of at most
// MAX_VOICE_SEGMENT_CHARS characters, so the cap also bounds the spend.
// A rate_limits row of type daily_voice_clips overrides it.
export const VOICE_LIMIT_TYPE = "daily_voice_clips";
export const VOICE_QUOTA_KEY = "voice";
const DAILY_VOICE_CLIPS = { paid: 60, trial: 12 } as const;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type VoiceErrorCode =
  | "voice_unavailable"
  | "voice_limit_reached"
  | "voice_token_invalid"
  | "voice_provider_error"
  | "banned";

function errorResponse(status: number, error: string, corsHeaders: Record<string, string>, code?: VoiceErrorCode) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status, headers: corsHeaders });
}

// The body is read up to the limit and no further, so an oversized request
// is refused without being held in memory.
async function readBoundedBody(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_REQUEST_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      received += value.byteLength;
      if (received > MAX_REQUEST_BODY_BYTES) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

async function readRequest(req: Request): Promise<{ feature: VoiceFeature; text: string; token: string } | null> {
  const raw = await readBoundedBody(req);
  if (raw === null) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { feature, text, token } = body as Record<string, unknown>;
  if (!isVoiceFeature(feature)) return null;
  if (typeof text !== "string" || !text.trim() || text.length > MAX_VOICE_SEGMENT_CHARS) return null;
  if (typeof token !== "string" || token.length > 128) return null;
  return { feature, text, token };
}

async function dailyClipLimit(userId: string): Promise<number> {
  const subscription = await getSubscriptionInfo(userId);
  // No AI access means no voice either; the browser voice still works.
  if (subscription.dailyLimit <= 0) return 0;
  const fallback = subscription.canAccessProModels ? DAILY_VOICE_CLIPS.paid : DAILY_VOICE_CLIPS.trial;
  return await getConfiguredDailyLimit(userId, fallback, VOICE_LIMIT_TYPE);
}

export async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(401, "Unauthorized", corsHeaders);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) return errorResponse(401, "Invalid token", corsHeaders);
  const userId = user.id;

  const request = await readRequest(req);
  if (!request) return errorResponse(400, "Invalid voice request", corsHeaders);
  const { feature, text, token } = request;
  if (!(await verifyVoiceToken(userId, feature, text, token))) {
    return errorResponse(403, "Invalid or expired voice token", corsHeaders, "voice_token_invalid");
  }

  // Checked before any quota is reserved: without the key nothing is spent.
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY")?.trim();
  if (!apiKey) return errorResponse(503, "Voice is not configured", corsHeaders, "voice_unavailable");

  const model = VOICE_MODELS[feature];
  const usageFeature = `voice_${feature}`;
  try {
    if (await checkUserBanned(userId)) {
      return errorResponse(403, "Your account has been suspended. Please contact support.", corsHeaders, "banned");
    }
    const limit = await dailyClipLimit(userId);
    if (limit <= 0) return errorResponse(402, "Voice is not included in your current access.", corsHeaders, "voice_limit_reached");

    // The same atomic counter as the AI quota, under its own key.
    const { data: quota, error: quotaError } = await supabase.rpc("consume_daily_quota", {
      p_user_id: userId,
      p_limit: limit,
      p_quota_key: VOICE_QUOTA_KEY,
    });
    if (quotaError) throw new Error("Voice quota reservation failed");
    const quotaRow = Array.isArray(quota) ? quota[0] : quota;
    if (!quotaRow?.allowed) {
      await logUsage(userId, usageFeature, ELEVENLABS_PROVIDER, model, undefined, undefined, "rate_limited", "voice_limit_reached");
      return Response.json({
        error: "You have used today's opponent voice allowance.",
        code: "voice_limit_reached" satisfies VoiceErrorCode,
        limit,
        current: quotaRow?.current_count ?? limit,
      }, { status: 402, headers: corsHeaders });
    }
  } catch (error) {
    console.error("[VOICE] Access check failed:", error instanceof Error ? error.message : "Unknown error");
    return errorResponse(500, "Unable to verify voice access", corsHeaders);
  }

  const startedAt = Date.now();
  const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID")?.trim() || DEFAULT_VOICE_ID;
  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      `${ELEVENLABS_API_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: model }),
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)]),
      },
    );
  } catch (error) {
    // The request may have been billed, so the cost stays unknown.
    await logUsage(userId, usageFeature, ELEVENLABS_PROVIDER, model, { incomplete: true }, Date.now() - startedAt, "error", error instanceof Error ? error.name.slice(0, 100) : "fetch_failed");
    return errorResponse(502, "The voice provider could not be reached.", corsHeaders, "voice_provider_error");
  }

  if (!providerResponse.ok) {
    await providerResponse.body?.cancel();
    // The status is enough to diagnose; the provider's body is not forwarded.
    await logUsage(userId, usageFeature, ELEVENLABS_PROVIDER, model, { billedCharacters: 0 }, Date.now() - startedAt, "error", `elevenlabs_${providerResponse.status}`);
    // The clip stays counted even though a refusal is not billed. Giving it
    // back would let replayed tokens call the provider without limit while
    // it refuses; the client switches to the browser voice for the rest of
    // the round instead, so a refusal costs at most one clip per round.
    return errorResponse(502, "The voice provider rejected the request.", corsHeaders, "voice_provider_error");
  }

  let audio: ArrayBuffer;
  try {
    audio = await providerResponse.arrayBuffer();
  } catch (error) {
    // The stream broke after a successful start, so the clip may be billed.
    await logUsage(userId, usageFeature, ELEVENLABS_PROVIDER, model, { incomplete: true }, Date.now() - startedAt, "error", error instanceof Error ? error.name.slice(0, 100) : "stream_failed");
    return errorResponse(502, "The voice provider's audio was cut off.", corsHeaders, "voice_provider_error");
  }
  await logUsage(
    userId,
    usageFeature,
    ELEVENLABS_PROVIDER,
    model,
    normalizeElevenLabsUsage({
      characters: text.length,
      characterCostHeader: providerResponse.headers.get("character-cost"),
      requestId: providerResponse.headers.get("request-id"),
    }),
    Date.now() - startedAt,
  );
  return new Response(audio, {
    headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
