// Inline audio tags for the spoken opponent, shared by the browser and the
// Edge Functions (no Deno or DOM APIs).
//
// In a voice round the model may write stage directions such as [sighs] into
// its speech. ElevenLabs performs them; nobody should ever read them. The
// server therefore keeps two versions of each reply: the spoken text sent to
// ElevenLabs, and the clean text that is shown, saved, signed, and read by the
// browser's fallback voice.

/** Tags the prompt offers and ElevenLabs receives. Anything else is dropped. */
export const VOICE_AUDIO_TAGS = [
  "sighs",
  "exhales",
  "laughs",
  "chuckles",
  "scoffs",
  "pause",
  "sarcastic",
  "skeptical",
  "curious",
  "amused",
  "incredulous",
  "serious",
  "emphatic",
  "calm",
] as const;

/** The longest text one voice request may carry, tags included. */
export const MAX_VOICE_SEGMENT_CHARS = 1_000;
/** Segments aim below the limit so a trailing tag still fits. */
const TARGET_VOICE_SEGMENT_CHARS = 900;
/** The most segments one reply signs for ElevenLabs, which bounds its cost. */
export const MAX_VOICE_SEGMENTS = 12;

const ALLOWED_TAGS: ReadonlySet<string> = new Set(VOICE_AUDIO_TAGS);

// A tag is a short bracketed phrase of words. Digits are excluded so a
// citation marker like [1] survives, and a following "(" is excluded so a
// Markdown link survives.
const TAG_PATTERN = /\[\s*(\p{L}[\p{L} ,'’-]{0,38}?)\s*\](?!\()/gu;

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    // A lone full stop closes up; the "..." that stands for a pause keeps its space.
    .replace(/[ \t]+([,;:!?]|\.(?!\.))/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTag(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The text a person reads: every audio tag removed. */
export function stripAudioTags(text: string): string {
  return tidy(text.replace(TAG_PATTERN, " "));
}

function splitSentences(text: string): string[] {
  // Keep the whitespace with the sentence it follows so joining is lossless.
  return text.match(/[^.!?…\n]*(?:[.!?…]+["'”’)]*|\n+|$)\s*/gu)?.filter((part) => part.length > 0) ?? [];
}

/**
 * The text ElevenLabs reads. Allowlisted tags stay, [pause] becomes an
 * ellipsis (Eleven v4 has no pause tag; its documented pause is "..."), and
 * every other tag goes. Tags are also rationed so a model that ignores the
 * prompt still sounds like a person: at most one per sentence, never in two
 * sentences running, and no more than `maxTags` in the whole reply.
 */
export function toSpokenText(text: string, maxTags: number): string {
  let kept = 0;
  let previousSentenceTagged = false;
  const sentences = splitSentences(text).map((sentence) => {
    let taggedHere = false;
    const spoken = sentence.replace(TAG_PATTERN, (_match, rawName: string) => {
      const name = normalizeTag(rawName);
      if (!ALLOWED_TAGS.has(name)) return " ";
      if (taggedHere || previousSentenceTagged || kept >= maxTags) return " ";
      taggedHere = true;
      kept += 1;
      return name === "pause" ? "..." : `[${name}]`;
    });
    // A sentence that is only whitespace does not reset the spacing rule.
    if (sentence.trim()) previousSentenceTagged = taggedHere;
    return spoken;
  });
  return tidy(sentences.join(""));
}

function hardSplit(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const breakAt = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"));
    const cut = breakAt > limit / 2 ? breakAt : limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Cut spoken text into requests of at most MAX_VOICE_SEGMENT_CHARS at
 * sentence boundaries, so the first audio arrives quickly and a failure costs
 * one segment rather than a whole speech. Every segment is returned; the
 * caller signs at most MAX_VOICE_SEGMENTS and leaves the rest to the browser
 * voice.
 */
export function splitSpokenSegments(spoken: string): string[] {
  const segments: string[] = [];
  let current = "";
  const push = () => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = "";
  };
  for (const sentence of splitSentences(spoken)) {
    if (sentence.trim().length > TARGET_VOICE_SEGMENT_CHARS) {
      push();
      segments.push(...hardSplit(sentence.trim(), TARGET_VOICE_SEGMENT_CHARS));
      continue;
    }
    if ((current + sentence).trim().length > TARGET_VOICE_SEGMENT_CHARS) push();
    current += sentence;
  }
  push();

  // A segment with nothing to say (a lone tag) joins the one before it.
  const merged: string[] = [];
  for (const segment of segments) {
    const speakable = stripAudioTags(segment).replace(/[.…\s]/g, "");
    if (!speakable && merged.length > 0 && (merged[merged.length - 1].length + segment.length + 1) <= MAX_VOICE_SEGMENT_CHARS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${segment}`;
    } else if (speakable) {
      merged.push(segment);
    }
  }
  return merged;
}
