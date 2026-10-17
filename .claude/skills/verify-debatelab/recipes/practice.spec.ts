import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, expectProviderCalls, expectStreamed, test } from "./fixtures";

// Feature map: features/practice.md. Voice rounds are recipes/voice-rounds.spec.ts.
// A new account has no Current Debate, so each round first accepts the offer
// to start one for its motion; the finished round is filed in that debate.
const sparMotion = "This House would make public transport free at the point of use.";
const resolution = "Resolved: cities should ban private cars downtown.";

test("spar-round and spar-verdict: a Lincoln-Douglas round is argued, judged, and saved", async ({ signedIn: page, user, evidence }) => {
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(sparMotion);
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  await evidence.step("Sparring: started a Lincoln-Douglas round and a debate for its motion");

  const speeches = [
    ["Affirmative constructive", "Universal access removes the direct price barrier to participation in work, school, and civic life."],
    ["First affirmative rebuttal", "Targeted discounts leave eligibility gaps and add administrative friction that keeps poor riders out."],
    ["Second affirmative rebuttal", "Weigh reliability: the universal policy covers every marginal trip, while targeting misses many of them."],
  ] as const;
  for (const [turn, content] of speeches) {
    const draft = page.getByRole("textbox", { name: `Draft for ${turn}` });
    // The opponent speaks between the user's turns; the next draft box appears after it.
    await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
    await draft.fill(content);
    await page.getByRole("button", { name: "Submit speech" }).click();
    await evidence.step(`Submitted ${turn}`);
  }
  await evidence.shot("01-round-in-progress");

  await expect(page.getByRole("heading", { name: "Here is what happened in the room." })).toBeVisible({ timeout: AI_TIMEOUT * 2 });
  await evidence.shot("02-verdict");
  await evidence.aria("02-verdict");
  await expect.poll(async () => {
    const { data } = await admin.from("sparring_sessions").select("status").eq("user_id", await user.userId());
    return data?.map((row) => row.status);
  }).toEqual(["complete"]);
  const { data: session } = await admin.from("sparring_sessions").select("status,side,final_evaluation,debates(motion)").eq("user_id", await user.userId()).single();
  await evidence.json("03-sparring-session", session);
  // The judged round is filed in the debate created for its motion, with the user's side.
  expect(session).toMatchObject({ side: "pro", debates: { motion: sparMotion } });
  const calls = await expectProviderCalls(["sparring"]);
  expect(calls.some((call) => call.feature === "sparring" && /SPARRING ACTION: score/m.test(call.user ?? ""))).toBe(true);
  // Opponent speeches and the scorecard were shown live (features/live-generation.md).
  await expectStreamed(["sparring"]);
});

async function startCrossfire(page: import("@playwright/test").Page, mode: "mode-question-ai" | "mode-ai-questions-user") {
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill(resolution);
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId(mode).click();
  await page.getByTestId("start-crossfire").click();
  await chooseForMotion(page, "create");
}

/** The finished exchange is recorded in the debate created for its resolution. */
async function expectCrossfireSaved(userId: string) {
  await expect.poll(async () => {
    const { data } = await admin.from("crossfires").select("title,debates(motion)").eq("user_id", userId);
    return data;
  }).toEqual([{ title: resolution, debates: { motion: resolution } }]);
}

test("cross-turn and cross-debrief: questioning the AI gets an answer, a Jev signal, and a debrief", async ({ signedIn: page, user, evidence }) => {
  await startCrossfire(page, "mode-question-ai");
  await page.getByTestId("crossfire-input").fill("What evidence links fewer private cars to safer streets?");
  const turn = aiResponse(page, "crossfire");
  await page.getByTestId("submit-turn").click();
  const body = await turn;
  await evidence.json("01-crossfire-turn", body);
  const text = (body.output as { text?: string }).text;
  expect(text?.length).toBeGreaterThan(0);
  await expect(page.getByText(text!.slice(0, 40)).first()).toBeVisible();
  await evidence.shot("02-answer");
  await expectProviderCalls(["crossfire", "jev"]);

  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("03-debrief");
  await evidence.aria("03-debrief", page.getByTestId("crossfire-debrief"));
  await expectCrossfireSaved(await user.userId());
  // The turn and the debrief were shown live (features/live-generation.md).
  await expectStreamed(["crossfire"]);
});

test("cross-ai-questions: the AI questions the user, answers are judged, and the debrief completes", async ({ signedIn: page, user, evidence }) => {
  const opening = aiResponse(page, "crossfire", "next-turn");
  await startCrossfire(page, "mode-ai-questions-user");
  const question = (await opening).output as { text: string };
  await expect(page.getByText(question.text.slice(0, 40)).first()).toBeVisible();
  await evidence.json("01-ai-question", question);
  await evidence.shot("01-ai-question");

  const answer = "Downtown crash data fell after car-free zones were introduced in several cities.";
  await page.getByTestId("crossfire-input").fill(answer);
  const next = aiResponse(page, "crossfire", "next-turn");
  await page.getByTestId("submit-turn").click();
  const followUp = (await next).output as { text: string };
  await expect(page.getByText(followUp.text.slice(0, 40)).first()).toBeVisible();
  await evidence.step(`Answered: "${answer}"; the AI asked a follow-up`);

  const debrief = aiResponse(page, "crossfire", "debrief");
  await page.getByTestId("end-crossfire").click();
  await evidence.json("02-debrief", (await debrief).output);
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("02-debrief");
  await expectCrossfireSaved(await user.userId());
});
