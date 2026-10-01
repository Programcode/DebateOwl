import {
  MAX_VOICE_SEGMENT_CHARS,
  MAX_VOICE_SEGMENTS,
  splitSpokenSegments,
  stripAudioTags,
  toSpokenText,
} from "./voice-tags.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("clean text carries no audio tag, known or invented", () => {
  assertEquals(
    stripAudioTags("[sighs] That is one reading. [dramatic gasp] It is not the only one [laughs]."),
    "That is one reading. It is not the only one.",
    "clean text",
  );
});

Deno.test("clean text keeps Markdown links and numbered citations", () => {
  const text = "See [the study](https://example.org/a) and note [1]. [sarcastic] Sure.";
  assertEquals(stripAudioTags(text), "See [the study](https://example.org/a) and note [1]. Sure.", "clean text");
});

Deno.test("clean text keeps paragraph breaks", () => {
  assertEquals(stripAudioTags("First point. [pause]\n\n[serious] Second point."), "First point.\n\nSecond point.", "clean text");
});

Deno.test("spoken text keeps allowlisted tags and drops invented ones", () => {
  assertEquals(
    toSpokenText("[Sighs] That is one reading. Fine. [dramatic gasp] It is not the only one.", 6),
    "[sighs] That is one reading. Fine. It is not the only one.",
    "spoken text",
  );
});

Deno.test("a pause becomes the ellipsis Eleven v4 documents", () => {
  assertEquals(toSpokenText("You said it works. [pause] Does it?", 6), "You said it works. ... Does it?", "spoken text");
});

Deno.test("tags are rationed: one per sentence, never two sentences running, capped overall", () => {
  assertEquals(
    toSpokenText("[sighs] One [laughs]. [scoffs] Two. [amused] Three. Four. [curious] Five.", 2),
    "[sighs] One. Two. [amused] Three. Four. Five.",
    "spoken text",
  );
});

Deno.test("long speeches split at sentence ends inside the request limit", () => {
  const sentence = "The comparative holds because the mechanism reaches every rider, not only the eligible ones.";
  const spoken = Array.from({ length: 40 }, (_, index) => `${index % 9 === 0 ? "[serious] " : ""}${sentence}`).join(" ");
  const segments = splitSpokenSegments(spoken);
  if (segments.length < 2) throw new Error("a long speech was not split");
  for (const segment of segments) {
    if (segment.length > MAX_VOICE_SEGMENT_CHARS) throw new Error(`segment has ${segment.length} characters`);
    if (!/[.!?]$/.test(segment)) throw new Error(`segment does not end a sentence: ${segment.slice(-30)}`);
  }
  assertEquals(segments.join(" "), spoken, "rejoined segments");
});

Deno.test("an overlong sentence is cut and a lone trailing tag joins its neighbour", () => {
  const long = `${"word ".repeat(400).trim()}.`;
  for (const segment of splitSpokenSegments(long)) {
    if (segment.length > MAX_VOICE_SEGMENT_CHARS) throw new Error(`segment has ${segment.length} characters`);
  }
  const padded = `${"A full sentence of filler text. ".repeat(28).trim()} [laughs]`;
  const segments = splitSpokenSegments(padded);
  for (const segment of segments) {
    if (!stripAudioTags(segment)) throw new Error("a segment has nothing to say");
  }
  if (!segments[segments.length - 1].endsWith("[laughs]")) throw new Error("the trailing tag was lost");
});

Deno.test("segment count is bounded", () => {
  const spoken = `${"word ".repeat(180).trim()}. `.repeat(40);
  if (splitSpokenSegments(spoken).length !== MAX_VOICE_SEGMENTS) throw new Error("segment cap not applied");
});

Deno.test("text with only tags yields no segment", () => {
  assertEquals(splitSpokenSegments("[sighs]").length, 0, "segments");
});
