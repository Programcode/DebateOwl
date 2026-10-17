import { admin, chooseForMotion, expect, fake, MARK, providerCall, stackReady, test } from "./stack";
import { say, spokenByBrowser, stubSpeech } from "../helpers/voice";
import { readAIResponse } from "../helpers/ai-response";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

// The real ai and voice Edge Functions with no ElevenLabs key, which is how
// the stack runs until an operator adds one. The recogniser and the browser
// voice are scripted; everything behind the browser is real.

type VoiceBody = { voice?: { segments: Array<{ text: string; token: string }> } };

test("a spoken sparring round runs on the browser voice, and no audio tag is shown or saved", async ({ signedIn: page, user }) => {
  await stubSpeech(page);
  const aiVoice: VoiceBody[] = [];
  const voiceAnswers: Array<{ status: number; code?: string }> = [];
  page.on("response", async (response) => {
    if (response.request().method() !== "POST") return;
    const path = new URL(response.url()).pathname;
    if (path.endsWith("/functions/v1/ai")) aiVoice.push(await readAIResponse(response).then(({ body }) => body).catch(() => ({})));
    if (path.endsWith("/functions/v1/voice")) {
      const body = await response.json().catch(() => ({}));
      voiceAnswers.push({ status: response.status(), code: body.code });
    }
  });

  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill("This House would make public transport free at the point of use.");
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByTestId("voice-mode").click();
  await page.getByRole("button", { name: "Turn on voice" }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");

  const speeches = [
    ["Affirmative constructive", "Um, universal access removes the direct price barrier to participation."],
    ["First affirmative rebuttal", "Targeted discounts preserve eligibility gaps and administrative friction."],
    ["Second affirmative rebuttal", "The universal policy covers every marginal trip, so it is more reliable."],
  ] as const;
  const reply = `${MARK} opponent speech: the policy needs a stronger comparative case. It is not there yet.`;
  let replies = 0;
  for (const [turn, words] of speeches) {
    const draft = page.getByRole("textbox", { name: `Draft for ${turn}` });
    await expect(draft).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("voice-mic").click();
    await expect(page.getByText("Listening")).toBeVisible();
    await say(page, words);
    await expect(draft).toHaveValue(words);
    await page.getByRole("button", { name: "Submit speech" }).click();
    if (turn !== "Second affirmative rebuttal") {
      replies += 1;
      await expect(page.getByText(`${MARK} opponent speech`).last()).toBeVisible({ timeout: 30_000 });
      // The student lets the opponent finish. Turning the microphone on any
      // sooner speaks over the opponent, which stops its voice and abandons
      // the voice request before the answer arrives.
      await expect.poll(() => voiceAnswers.length, { timeout: 30_000 }).toBe(1);
      await expect.poll(async () => (await spokenByBrowser(page)).split(reply).length - 1, { timeout: 30_000 }).toBe(replies);
    }
  }
  await expect(page.getByText(`${MARK} verdict: the user had the edge.`)).toBeVisible({ timeout: 30_000 });

  // The opponent was told the speech is spoken, and the server split its reply:
  // signed segments keep the allowed tag and drop the invented one.
  const requests = await fake.requests();
  expect(requests.some((request) => request.feature === "sparring" && request.system.includes("SPOKEN ROUND:"))).toBe(true);
  const segments = aiVoice.flatMap((body) => body.voice?.segments ?? []);
  expect(segments.length).toBeGreaterThan(0);
  expect(segments[0].text).toBe(`[sighs] ${reply}`);
  expect(segments[0].token).toMatch(/^\d+\.[a-f0-9]{64}$/);

  // With no key the voice function says so, once, and the browser voice reads
  // the clean text of both replies: the second without asking the function again.
  expect(voiceAnswers).toEqual([{ status: 503, code: "voice_unavailable" }]);
  expect(await spokenByBrowser(page)).toBe(`${reply} ${reply}`);
  expect(await spokenByBrowser(page)).not.toContain("[");

  // The judge was given the measured facts and the rule against claiming to have heard anything.
  const judge = requests.find((request) => request.feature === "sparring" && request.user.includes("SPARRING ACTION: score"));
  expect(judge?.system).toContain("You did not hear this round");
  expect(judge?.user).toContain('"wordsPerMinute"');

  // Scorecard: measured facts, and no tag anywhere on the page.
  await expect(page.getByTestId("spoken-delivery")).toContainText("Nobody listened for tone, confidence or volume");
  await page.getByRole("button", { name: "Show transcript" }).click();
  await expect(page.locator("body")).not.toContainText("[sighs]");
  await expect(page.locator("body")).not.toContainText("[dramatic gasp]");

  // The saved round holds clean opponent text and the user's measurements.
  let saved: { turns: Array<{ speaker: string; content: string; delivery?: { wordCount: number; fillerCount: number } }> } | null = null;
  await expect.poll(async () => {
    const { data } = await admin.from("sparring_sessions").select("status,turns").eq("user_id", await user.userId());
    saved = data?.[0] ?? null;
    return data?.map((row) => row.status);
  }).toEqual(["complete"]);
  const turns = saved!.turns;
  expect(turns.filter((turn) => turn.speaker === "ai").map((turn) => turn.content)).toEqual([reply, reply]);
  expect(turns[0].delivery).toMatchObject({ wordCount: 10, fillerCount: 1 });
  expect(turns[1].delivery).toBeUndefined();

  // No provider voice was used, so no voice usage was billed.
  const { data: usage } = await admin.from("ai_requests").select("feature").eq("user_id", await user.userId()).like("feature", "voice_%");
  expect(usage).toEqual([]);
});

test("a spoken Crossfire reply is cleaned, signed, and read by the browser voice", async ({ signedIn: page }) => {
  await stubSpeech(page);
  const aiVoice: Array<VoiceBody & { output?: { text?: string } }> = [];
  page.on("response", async (response) => {
    if (response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/functions/v1/ai")) {
      aiVoice.push(await readAIResponse(response).then(({ body }) => body).catch(() => ({})));
    }
  });

  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill("Resolved: cities should ban private cars downtown.");
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId("mode-question-ai").click();
  await page.getByTestId("voice-mode").click();
  await page.getByRole("button", { name: "Turn on voice" }).click();
  await page.getByTestId("start-crossfire").click();
  await chooseForMotion(page, "create");

  await page.getByTestId("voice-mic").click();
  await expect(page.getByText("Listening")).toBeVisible();
  await say(page, "What evidence supports the safety mechanism?");
  await expect(page.getByTestId("crossfire-input")).toHaveValue("What evidence supports the safety mechanism?");
  await page.getByTestId("submit-turn").click();

  const answer = `${MARK} crossfire answer: what evidence links fewer cars to safer streets?`;
  await expect(page.getByText(answer)).toBeVisible({ timeout: 30_000 });
  expect((await providerCall("crossfire")).user).toContain("SPOKEN EXCHANGE:");
  await expect.poll(() => spokenByBrowser(page)).toBe(answer);
  await expect(page.locator("body")).not.toContainText("[scoffs]");

  const reply = aiVoice.find((body) => body.voice);
  expect(reply?.output?.text).toBe(answer);
  expect(reply?.voice?.segments[0].text).toBe(`[scoffs] ${answer}`);

  // The Jev signal still attaches: the signed reply is the clean one.
  await expect(page.getByText("Direct answer")).toBeVisible();

  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("spoken-delivery")).toBeVisible();
});
