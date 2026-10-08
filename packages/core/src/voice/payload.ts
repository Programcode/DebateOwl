import { z } from 'zod';
import { MAX_VOICE_SEGMENT_CHARS, MAX_VOICE_SEGMENTS } from '../contract/voice-tags';

// What an AI response carries for a voice round: the opponent's reply cut
// into segments, each signed by the server so the voice function will speak
// it. The spoken text may hold audio tags and is never shown or saved.

export type VoiceFeature = 'sparring' | 'crossfire';

const VoiceSegmentSchema = z.object({
  text: z.string().min(1).max(MAX_VOICE_SEGMENT_CHARS),
  token: z.string().min(1).max(128),
});
// The unsigned rest of a reply too long for MAX_VOICE_SEGMENTS. It is read
// by the browser voice only; replies are at most 6,000 characters.
const MAX_VOICE_OVERFLOW_CHARS = 12_000;
const VoicePayloadSchema = z.object({
  segments: z.array(VoiceSegmentSchema).min(1).max(MAX_VOICE_SEGMENTS),
  overflow: z.string().min(1).max(MAX_VOICE_OVERFLOW_CHARS).optional(),
});
export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;
export type VoicePayload = z.infer<typeof VoicePayloadSchema>;

/** The signed segments an AI response carries; undefined when absent or malformed. */
export function parseVoicePayload(value: unknown): VoicePayload | undefined {
  const parsed = VoicePayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
