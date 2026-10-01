for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { createVoiceToken, prepareVoiceReply, verifyVoiceToken, VOICE_TOKEN_TTL_MS } = await import("./voice-token.ts");

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
  assert(!(await verifyVoiceToken(USER_ID, "sparring", "Hello there.", token, now - 1)), "a token from the future passed");
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
