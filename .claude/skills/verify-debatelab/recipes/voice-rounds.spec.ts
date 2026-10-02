import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, expectProviderCalls, LIVE, providerCalls, say, spokenByBrowser, stubSpeech, test } from "./fixtures";

// Feature map: features/voice-rounds.md. Mirrors e2e/full-stack/voice.spec.ts
// with structural assertions, so it passes in both modes. The local stack has
// no ElevenLabs key: the voice function answers 503 once and the browser voice
// reads every reply. The recogniser and the browser voice are scripted
// (e2e/helpers/voice.ts); everything behind the browser is real.

type VoiceSegment = { text: string; token: string };
type AiBody = { output?: { speech?: { content?: string }; text?: string }; voice?: { segments: VoiceSegment[] } };

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

test("voice-spar: a spoken sparring round runs on the browser voice, and no audio tag is shown or saved", async ({ signedIn: page, user, evidence }) => {
  // Init scripts apply from the next load, which is the goto below.
  await stubSpeech(page);

  const voiceAnswers: Array<{ status: number; code?: string }> = [];
  page.on("response", async (response) => {
    if (response.request().method() !== "POST" || !new URL(response.url()).pathname.endsWith("/functions/v1/voice")) return;
    const body = await response.json().catch(() => ({}));
    voiceAnswers.push({ status: response.status(), code: body.code });
  });

  const motion = "This House would make public transport free at the point of use.";
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(motion);
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByTestId("voice-mode").click();
  await page.getByRole("button", { name: "Turn on voice" }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  await evidence.step("Sparring: voice mode on, started a Lincoln-Douglas round and a debate for its motion");

  const speeches = [
    ["Affirmative constructive", "Um, universal access removes the direct price barrier to participation."],
    ["First affirmative rebuttal", "Targeted discounts preserve eligibility gaps and administrative friction."],
    ["Second affirmative rebuttal", "The universal policy covers every marginal trip, so it is more reliable."],
  ] as const;
  const replies: string[] = [];
  const segments: VoiceSegment[] = [];
  for (const [turn, words] of speeches) {
    const draft = page.getByRole("textbox", { name: `Draft for ${turn}` });
    await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
    await page.getByTestId("voice-mic").click();
    await expect(page.getByText("Listening")).toBeVisible();
    await say(page, words);
    await expect(draft).toHaveValue(words);
    const last = turn === "Second affirmative rebuttal";
    const opponent = last ? null : aiResponse(page, "sparring");
    await page.getByRole("button", { name: "Submit speech" }).click();
    await evidence.step(`Spoke and submitted ${turn}: "${words}"`);
    if (!opponent) continue;
    const body = (await opponent) as AiBody;
    const reply = body.output?.speech?.content ?? "";
    expect(reply.length, "opponent speech text").toBeGreaterThan(0);
    replies.push(reply);
    segments.push(...(body.voice?.segments ?? []));
    await expect(page.getByText(reply.slice(0, 40)).last()).toBeVisible();
    // Let the opponent finish. Turning the microphone on any sooner speaks over
    // the opponent, which stops its voice and abandons the voice request.
    await expect.poll(() => voiceAnswers.length, { timeout: AI_TIMEOUT }).toBe(1);
    await expect.poll(async () => squash(await spokenByBrowser(page)), { timeout: AI_TIMEOUT }).toBe(squash(replies.join(" ")));
    await evidence.step(`The browser voice finished reading opponent reply ${replies.length}`);
  }
  await evidence.shot("01-round-spoken");

  await expect(page.getByRole("heading", { name: "Here is what happened in the room." })).toBeVisible({ timeout: AI_TIMEOUT * 2 });
  await evidence.shot("02-verdict");

  // The server signed segments for the voice service; the page and the browser voice got clean text.
  expect(segments.length, "signed voice segments").toBeGreaterThan(0);
  for (const segment of segments) expect(segment.token).toMatch(/^\d+\.[a-f0-9]{64}$/);
  await evidence.json("03-voice-segments", segments);
  if (!LIVE) {
    // The fake opponent uses one allowed tag and one invented tag; only the allowed one is signed.
    expect(segments[0].text).toBe(`[sighs] ${replies[0]}`);
  }
  // No key: the voice function said so once, and the browser voice read every reply.
  expect(voiceAnswers).toEqual([{ status: 503, code: "voice_unavailable" }]);
  expect(await spokenByBrowser(page)).not.toContain("[");

  // The opponent was told the round is spoken; the judge got measured facts and the rule against claiming to have heard it.
  const calls = await expectProviderCalls(["sparring"]);
  expect(calls.some((call) => call.feature === "sparring" && call.system?.includes("SPOKEN ROUND:"))).toBe(true);
  const judge = calls.find((call) => call.feature === "sparring" && /SPARRING ACTION: score/m.test(call.user ?? ""));
  expect(judge?.system).toContain("You did not hear this round");
  expect(judge?.user).toContain('"wordsPerMinute"');

  // Scorecard: measured delivery facts, and no audio tag anywhere on the page.
  await expect(page.getByTestId("spoken-delivery")).toContainText("Nobody listened for tone, confidence or volume");
  await page.getByRole("button", { name: "Show transcript" }).click();
  await expect(page.locator("body")).not.toContainText("[sighs]");
  await expect(page.locator("body")).not.toContainText("[dramatic gasp]");
  await evidence.aria("04-scorecard", page.getByTestId("spoken-delivery"));

  // The saved round holds clean opponent text and the user's measurements, in the debate for its motion.
  const userId = await user.userId();
  await expect.poll(async () => {
    const { data } = await admin.from("sparring_sessions").select("status").eq("user_id", userId);
    return data?.map((row) => row.status);
  }).toEqual(["complete"]);
  const { data: saved } = await admin.from("sparring_sessions").select("turns,debates(motion)").eq("user_id", userId).single();
  await evidence.json("05-sparring-session", saved);
  const turns = saved!.turns as Array<{ speaker: string; content: string; delivery?: { wordCount: number; fillerCount: number } }>;
  expect(turns.filter((turn) => turn.speaker === "ai").map((turn) => turn.content)).toEqual(replies);
  expect(turns[0].delivery).toMatchObject({ wordCount: 10, fillerCount: 1 });
  expect(turns[1].delivery).toBeUndefined();
  expect(saved!.debates).toEqual({ motion });

  // No provider voice was used, so no voice usage was billed.
  const { data: usage } = await admin.from("ai_requests").select("feature").eq("user_id", userId).like("feature", "voice_%");
  expect(usage).toEqual([]);
});

test("voice-cross: a spoken Crossfire question gets a clean, signed reply read by the browser voice", async ({ signedIn: page, user, evidence }) => {
  await stubSpeech(page);

  const resolution = "Resolved: cities should ban private cars downtown.";
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill(resolution);
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId("mode-question-ai").click();
  await page.getByTestId("voice-mode").click();
  await page.getByRole("button", { name: "Turn on voice" }).click();
  await page.getByTestId("start-crossfire").click();
  await chooseForMotion(page, "create");

  const question = "What evidence supports the safety mechanism?";
  await page.getByTestId("voice-mic").click();
  await expect(page.getByText("Listening")).toBeVisible();
  await say(page, question);
  await expect(page.getByTestId("crossfire-input")).toHaveValue(question);
  const turn = aiResponse(page, "crossfire");
  await page.getByTestId("submit-turn").click();
  await evidence.step(`Crossfire: voice on, asked "${question}" through the microphone`);

  const body = (await turn) as AiBody;
  await evidence.json("01-crossfire-reply", body);
  const answer = body.output?.text ?? "";
  expect(answer.length, "crossfire answer text").toBeGreaterThan(0);
  expect(answer).not.toContain("[");
  await expect(page.getByText(answer.slice(0, 40)).first()).toBeVisible();
  const segments = body.voice?.segments ?? [];
  expect(segments.length, "signed voice segments").toBeGreaterThan(0);
  for (const segment of segments) expect(segment.token).toMatch(/^\d+\.[a-f0-9]{64}$/);
  if (!LIVE) expect(segments[0].text).toBe(`[scoffs] ${answer}`);
  await expect.poll(async () => squash(await spokenByBrowser(page)), { timeout: AI_TIMEOUT }).toBe(squash(answer));
  await expect(page.locator("body")).not.toContainText("[scoffs]");
  await evidence.shot("02-spoken-answer");

  const call = (await providerCalls()).find((item) => item.feature === "crossfire");
  expect(call?.user).toContain("SPOKEN EXCHANGE:");
  expect(call?.user).toContain(question);
  // The Jev signal still attaches: the signed reply is the clean one.
  await expectProviderCalls(["crossfire", "jev"]);
  if (!LIVE) await expect(page.getByText("Direct answer")).toBeVisible();

  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(page.getByTestId("spoken-delivery")).toBeVisible();
  await evidence.shot("03-debrief");
  await evidence.aria("03-debrief", page.getByTestId("crossfire-debrief"));
  await expect.poll(async () => {
    const { data } = await admin.from("crossfires").select("title,debates(motion)").eq("user_id", await user.userId());
    return data;
  }).toEqual([{ title: resolution, debates: { motion: resolution } }]);
});
