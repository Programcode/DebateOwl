// Publishing a finished mini round as a public page, and taking it down.
//
// Opt-in only: the visitor ticks a box and presses Publish. The request sends
// back the session token and every turn with the signature this function gave
// it, so nobody can publish text the model did not answer or moderation did
// not pass. Each field is redacted (redact.ts); the round is indexable only
// when it is substantial and nothing was redacted. The visitor receives a
// delete token, of which only the SHA-256 is stored.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { isSubstantial, redactPersonalData } from "./redact.ts";
import { toHex, verifySessionToken, verifyTurn } from "./signing.ts";

const MOTION_MAX = 200;
const ARGUMENT_MAX = 600;
const REBUTTAL_MAX = 2_000;
const JUDGE_NOTE_MAX = 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]{12}$/;
const DELETE_TOKEN = /^[0-9a-f]{64}$/;
const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

type Json = (status: number, body: Record<string, unknown>) => Response;
type Turn = { argument: string; rebuttal: string; judgeNote: string; signature: string };

interface PublishRequest {
  sessionId: string;
  sessionToken: string;
  motion: string;
  side: "for" | "against";
  turns: Turn[];
}

// Text the client received from this function, compared byte for byte with what was signed.
const exact = (value: unknown, max: number) => (typeof value === "string" && value.length <= max ? value : null);

function parsePublishRequest(raw: Record<string, unknown>): PublishRequest | null {
  const { sessionId, sessionToken, side } = raw;
  const motion = exact(raw.motion, MOTION_MAX);
  if (typeof sessionId !== "string" || !UUID.test(sessionId) || typeof sessionToken !== "string" || sessionToken.length > 256) return null;
  if ((side !== "for" && side !== "against") || !motion || !Array.isArray(raw.turns) || raw.turns.length < 1 || raw.turns.length > 2) return null;
  const turns: Turn[] = [];
  for (const item of raw.turns) {
    if (!item || typeof item !== "object") return null;
    const turn = item as Record<string, unknown>;
    const argument = exact(turn.argument, ARGUMENT_MAX);
    const rebuttal = exact(turn.rebuttal, REBUTTAL_MAX);
    const judgeNote = exact(turn.judgeNote, JUDGE_NOTE_MAX);
    const signature = exact(turn.signature, 64);
    if (!argument || !rebuttal || judgeNote === null || !signature) return null;
    turns.push({ argument, rebuttal, judgeNote, signature });
  }
  return { sessionId, sessionToken, motion, side, turns };
}

function randomSlug(): string {
  let slug = "";
  while (slug.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // 252 is the largest multiple of 36 below 256; a higher byte would bias the alphabet.
      if (byte < 252 && slug.length < 12) slug += SLUG_ALPHABET[byte % 36];
    }
  }
  return slug;
}

const sha256 = async (value: string) => toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

export async function handlePublish(raw: Record<string, unknown>, secret: string, supabase: SupabaseClient, json: Json): Promise<Response> {
  const request = parsePublishRequest(raw);
  if (!request) return json(400, { error: "invalid_request" });
  // The session token expires two hours after the first turn: a round is published soon after it ends, or not at all.
  if (!(await verifySessionToken(request.sessionToken, request.sessionId, secret))) {
    console.log("[DEMO] publish status=bad_session_token");
    return json(400, { error: "unknown_session" });
  }
  for (const [index, turn] of request.turns.entries()) {
    const signed = { sessionId: request.sessionId, turn: index + 1, motion: request.motion, side: request.side, ...turn };
    if (!(await verifyTurn(signed, turn.signature, secret))) {
      console.log(`[DEMO] publish status=bad_turn_signature turn=${index + 1}`);
      return json(400, { error: "invalid_round" });
    }
  }

  let redactions = 0;
  const clean = (text: string) => {
    const result = redactPersonalData(text.trim());
    redactions += result.redactions;
    return result.text;
  };
  const motion = clean(request.motion);
  const turns = request.turns.map((turn) => ({ argument: clean(turn.argument), rebuttal: clean(turn.rebuttal), judgeNote: clean(turn.judgeNote) }));
  const deleteToken = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const slug = randomSlug();

  const { data, error } = await supabase.rpc("publish_demo_round", {
    p_slug: slug,
    p_session_id: request.sessionId,
    p_motion: motion,
    p_side: request.side,
    p_turns: turns,
    p_indexable: isSubstantial(turns, redactions),
    p_delete_token_hash: await sha256(deleteToken),
  });
  if (error) {
    console.error("[DEMO] publish failed:", error.code);
    return json(500, { error: "unavailable" });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { status: string; indexable: boolean | null } | undefined;
  console.log(`[DEMO] publish status=${row?.status ?? "unavailable"} indexable=${row?.indexable === true} redactions=${redactions}`);
  if (row?.status === "already_published") return json(409, { error: "already_published" });
  if (row?.status !== "ok") return json(500, { error: "unavailable" });
  return json(200, { slug, deleteToken, indexable: row.indexable === true, redactions });
}

export async function handleUnpublish(raw: Record<string, unknown>, supabase: SupabaseClient, json: Json): Promise<Response> {
  const { slug, deleteToken } = raw;
  if (typeof slug !== "string" || !SLUG.test(slug) || typeof deleteToken !== "string" || !DELETE_TOKEN.test(deleteToken)) {
    return json(400, { error: "invalid_request" });
  }
  const { data, error } = await supabase.rpc("unpublish_demo_round", { p_slug: slug, p_delete_token_hash: await sha256(deleteToken) });
  if (error) {
    console.error("[DEMO] unpublish failed:", error.code);
    return json(500, { error: "unavailable" });
  }
  console.log(`[DEMO] unpublish removed=${data === true}`);
  return data === true ? json(200, { removed: true }) : json(404, { error: "not_found" });
}
