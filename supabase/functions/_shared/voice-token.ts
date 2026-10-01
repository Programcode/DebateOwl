// Signed, short-lived tokens that tie one piece of opponent speech to the
// user it was written for. The ai function issues them with each voice reply;
// the voice function verifies them before it spends anything. The endpoint
// can therefore speak only text the server wrote, never arbitrary input.

import { splitSpokenSegments, stripAudioTags, toSpokenText } from "./voice-tags.ts";

export type VoiceFeature = "sparring" | "crossfire";

export interface VoiceSegment {
  /** Spoken text for ElevenLabs, audio tags included. */
  text: string;
  token: string;
}

export interface VoicePayload {
  segments: VoiceSegment[];
}

/** Long enough to cover a full sparring speech played segment by segment. */
export const VOICE_TOKEN_TTL_MS = 30 * 60_000;

/** How many audio tags one reply may carry after rationing. */
export const MAX_VOICE_TAGS: Record<VoiceFeature, number> = {
  sparring: 6,
  crossfire: 1,
};

export function isVoiceFeature(value: unknown): value is VoiceFeature {
  return value === "sparring" || value === "crossfire";
}

let signingKey: Promise<CryptoKey> | undefined;

function importHmacKey(secret: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

// Read lazily so tests can set the environment before the first token.
function voiceSigningKey(): Promise<CryptoKey> {
  signingKey ??= (async () => {
    const root = Deno.env.get("SPARRING_INTEGRITY_SECRET")?.trim() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!root) throw new Error("Missing voice signing secret");
    const encoder = new TextEncoder();
    // Domain-separated from the sparring and Crossfire signing keys.
    const derived = await crypto.subtle.sign("HMAC", await importHmacKey(encoder.encode(root)), encoder.encode("DebateLab voice token key v1"));
    return importHmacKey(derived);
  })();
  return signingKey;
}

async function voiceMac(userId: string, feature: VoiceFeature, text: string, issuedAt: number): Promise<string> {
  const payload = JSON.stringify({ domain: "debatelab-voice-v1", userId, feature, issuedAt, text });
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await voiceSigningKey(), new TextEncoder().encode(payload)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createVoiceToken(userId: string, feature: VoiceFeature, text: string, now = Date.now()): Promise<string> {
  return `${now}.${await voiceMac(userId, feature, text, now)}`;
}

export async function verifyVoiceToken(userId: string, feature: VoiceFeature, text: string, token: string, now = Date.now()): Promise<boolean> {
  const [rawIssuedAt, suppliedMac, ...extra] = token.split(".");
  const issuedAt = Number(rawIssuedAt);
  if (extra.length > 0 || !Number.isInteger(issuedAt) || !/^[a-f0-9]{64}$/.test(suppliedMac ?? "")) return false;
  const age = now - issuedAt;
  if (age < 0 || age > VOICE_TOKEN_TTL_MS) return false;
  const expectedMac = await voiceMac(userId, feature, text, issuedAt);
  let mismatch = expectedMac.length ^ suppliedMac.length;
  for (let index = 0; index < expectedMac.length; index += 1) mismatch |= expectedMac.charCodeAt(index) ^ suppliedMac.charCodeAt(index);
  return mismatch === 0;
}

/**
 * Split a model reply into what people read and what the voice performs.
 * `clean` has no audio tag. `voice` holds signed segments for the voice
 * function, or is absent when nothing speakable remains.
 */
export async function prepareVoiceReply(
  userId: string,
  feature: VoiceFeature,
  modelText: string,
): Promise<{ clean: string; voice?: VoicePayload }> {
  const clean = stripAudioTags(modelText);
  const texts = splitSpokenSegments(toSpokenText(modelText, MAX_VOICE_TAGS[feature]));
  if (texts.length === 0) return { clean };
  const now = Date.now();
  const segments = await Promise.all(texts.map(async (text) => ({ text, token: await createVoiceToken(userId, feature, text, now) })));
  return { clean, voice: { segments } };
}
