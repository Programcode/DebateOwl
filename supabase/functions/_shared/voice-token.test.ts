for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { createVoiceToken, prepareVoiceReply, verifyVoiceToken, VOICE_TOKEN_CLOCK_SKEW_MS, VOICE_TOKEN_TTL_MS } = await import("./voice-token.ts");
const { MAX_VOICE_SEGMENTS, stripAudioTags } = await import("./voice-tags.ts");

const USER_ID = "11111111-1111-4111-8111-111111111111";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("a voice token verifies only for its user, feature, text, and lifetime", async () => {
  const now = 1_800_000_000_000;
  const token = await createVoiceToken(USER_ID, "sparring", "Hello there.", now);
  assert(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now + 1_000), "a fresh token was rejected");
  assert(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now + VOICE_TOKEN_TTL_MS), "a token at its limit was rejected");
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now + VOICE_TOKEN_TTL_MS + 1)), "an expired token passed");
  // The ai and voice functions may run on hosts whose clocks differ slightly.
  assert(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now - 1_000), "a token from a slightly fast clock was rejected");
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now - VOICE_TOKEN_CLOCK_SKEW_MS - 1)), "a token from the future passed");
  assert(!(await verifyVoiceToken(USER_ID, "crossfire", "Hello there.", token, now)), "another feature passed");
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there!", token, now)), "edited text passed");
  assert(!(await verifyVoiceToken("22222222-2222-4222-8222-222222222222", "sparring", "Hello there.", token, now)), "another user passed");
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", `${token}.extra`, now)), "a padded token passed");
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", `${now}.${"0".repeat(64)}`, now)), "a forged signature passed");
});

Deno.test("a voice reply separates what is read from what is performed", async () => {
  const reply = await prepareVoiceReply(USER_ID, "sparring", "[sighs] That is one reading. [stage whisper] It is not the only one.");
  assert(reply.clean === "That is one reading. It is not the only one.", `clean text kept a tag: ${reply.clean}`);
  assert(reply.voice?.segments.length === 1, "expected one segment");
  const [segment] = reply.voice.segments;
  assert(segment.text === "[sighs] That is one reading. It is not the only one.", `wrong spoken text: ${segment.text}`);
  assert(await verifyVoiceToken(USER_ID, "sparring", segment.text, segment.token), "the issued token did not verify");
});

Deno.test("Crossfire replies carry at most one tag", async () => {
  const reply = await prepareVoiceReply(USER_ID, "crossfire", "[scoffs] Really? Then answer this. [laughs] Which study?");
  assert(reply.voice?.segments[0].text === "[scoffs] Really? Then answer this. Which study?", `wrong spoken text: ${reply.voice?.segments[0].text}`);
});

Deno.test("a reply with nothing to say has no voice payload", async () => {
  const reply = await prepareVoiceReply(USER_ID, "crossfire", "[sighs]");
  assert(reply.clean === "" && reply.voice === undefined, "an empty reply produced a voice payload");
});

Deno.test("past the segment cap the rest of a reply is still spoken, unsigned", async () => {
  // Sentences just over half a segment long, so each segment holds one.
  const sentences = Array.from({ length: MAX_VOICE_SEGMENTS + 3 }, (_, index) => `Sentence ${index + 1} ${"is long ".repeat(60).trim()}.`);
  const reply = await prepareVoiceReply(USER_ID, "sparring", sentences.join(" "));
  assert(reply.voice?.segments.length === MAX_VOICE_SEGMENTS, `expected ${MAX_VOICE_SEGMENTS} signed segments, got ${reply.voice?.segments.length}`);
  const overflow = reply.voice.overflow ?? "";
  assert(overflow.startsWith(`Sentence ${MAX_VOICE_SEGMENTS + 1} `), `the rest did not start where the segments stopped: ${overflow.slice(0, 40)}`);
  assert(overflow.endsWith(sentences.at(-1)!), "the end of the reply was dropped");
  const spoken = [...reply.voice.segments.map((segment) => stripAudioTags(segment.text)), overflow].join(" ");
  assert(spoken === reply.clean, "signed segments and the rest do not add up to the reply");
});

Deno.test("a reply within the cap has no unsigned rest", async () => {
  const reply = await prepareVoiceReply(USER_ID, "sparring", "Short and signed.");
  assert(reply.voice && reply.voice.overflow === undefined, "a short reply carried unsigned text");
});
