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

  // QA round 3: the radar chart's axis labels follow the interface language.
  await switchLanguage(page, "Language", "Magyar");
  const axis = page.locator(".recharts-polar-angle-axis-tick text");
  await expect.poll(async () => (await axis.allTextContents()).sort()).toEqual(["Bizonyíték", "Előadás", "Logika", "Stratégia"]);
  await evidence.shot("04-verdict-hu");
  await switchLanguage(page, "Nyelv", "English");
});

/** The header's language popover: interface language first. */
async function switchLanguage(page: import("@playwright/test").Page, buttonName: string, language: string) {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await page.getByRole("radio", { name: language }).first().click();
}

test("spar-start: the setup prices the whole round, and Start shows the quota check until the round opens", async ({ signedIn: page, evidence }, testInfo) => {
  // The QA pass measured 375 px; the mobile project's Pixel 5 is wider.
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(sparMotion);
  // The school format has 4 opponent replies; the round is one charge, not one per reply.
  await expect(page.getByTestId("sparring-round-cost")).toHaveText(/^\d+ AI uses?$/);
  await expect(page.getByText("For the whole round: 4 replies + the judge")).toBeVisible();
  await evidence.shot("01-setup-cost-en");

  await switchLanguage(page, "Language", "Magyar");
  await expect(page.getByText("A forduló ára", { exact: true })).toBeVisible();
  await expect(page.getByText("Az egész fordulóra: 4 válasz + a bíró")).toBeVisible();
  await expect(page.getByText("Az iskolai formátum: bevezető, R1, R2 és záró beszéd mindkét oldalon.")).toBeVisible();
  await evidence.shot("02-setup-cost-hu");
  await switchLanguage(page, "Nyelv", "English");

  // Hold the pre-round quota check, as a slow server would.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let checks = 0;
  await page.route("**/functions/v1/ai", async (route) => {
    const body = route.request().postDataJSON() as { quotaCheck?: boolean } | null;
    if (body?.quotaCheck) {
      checks += 1;
      await held;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  const pending = page.getByRole("button", { name: /Opening room/ });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("sparring-starting")).toHaveText("Checking your AI uses for today…");
  await pending.click({ force: true });
  await evidence.shot("03-start-pending");
  await evidence.step("Start pressed twice while the quota check was held");

  release();
  await expect(page.getByText("Round in progress")).toBeVisible({ timeout: AI_TIMEOUT });
  expect(checks).toBe(1);
  await evidence.shot("04-round-open");
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

  // cross-history: after leaving the page, History reopens the round and can delete it.
  await page.goto("/app/history?tab=crossfire");
  const row = page.getByTestId("history-crossfire-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(resolution);
  await row.getByRole("button", { name: `Open Crossfire round: ${resolution}` }).click();
  const saved = page.getByTestId("saved-crossfire");
  await expect(saved.getByTestId("saved-crossfire-debrief")).toBeVisible();
  await expect(saved.getByTestId("saved-crossfire-transcript")).toContainText(text!.slice(0, 40));
  await evidence.shot("04-history-crossfire");
  await evidence.aria("04-history-crossfire", saved);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Delete Crossfire round: ${resolution}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await admin.from("crossfires").select("id").eq("user_id", await user.userId())).data).toEqual([]);
  await evidence.step("Reopened the round from History, then deleted it");
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

/**
 * Today's AI requests are used up: the server's counter (what the ai function
 * checks, what Crossfire and Sparring ask it for before a round, and what the
 * usage line reads) and the usage rows real calls leave. A refused call and a
 * Jev helper row are on the list too, and must not count as used.
 */
async function useUpDailyRequests(userId: string, limit: number) {
  await admin.from("user_settings").update({ daily_limit_override: limit }).eq("user_id", userId);
  const today = new Date().toISOString().slice(0, 10);
  const counter = await admin.from("daily_usage_counters").upsert({ user_id: userId, usage_date: today, quota_key: "ai", request_count: limit });
  expect(counter.error).toBeNull();
  const rows = [
    ...Array.from({ length: limit }, () => ({ user_id: userId, feature: "generate", provider: "openrouter", model: "fake", status: "success" })),
    { user_id: userId, feature: "ask", provider: "openrouter", model: "fake", status: "rate_limited" },
    { user_id: userId, feature: "jev_model_router", provider: "openrouter", model: "fake", status: "success" },
  ];
  const usage = await admin.from("ai_requests").insert(rows);
  expect(usage.error).toBeNull();
}

test("cross-daily-limit and spar-daily-limit: with no requests left, Crossfire stays in setup and Sparring warns first", async ({ signedIn: page, user, evidence }) => {
  await useUpDailyRequests(await user.userId(), 2);
  await evidence.step("Used up the account's 2 daily AI requests");

  await startCrossfire(page, "mode-ai-questions-user");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(dialog).toContainText("2 of 2");
  await evidence.shot("01-crossfire-limit-dialog");
  await evidence.aria("01-crossfire-limit-dialog", dialog);
  // The round never started: no clock, no End button, the setup kept.
  await expect(page.getByTestId("end-crossfire")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("start-crossfire")).toBeVisible();
  await expect(page.getByTestId("crossfire-resolution")).toHaveValue(resolution);
  await evidence.shot("02-crossfire-back-in-setup");

  await page.goto("/app/sparring");
  // QB-06: the same words as the Crossfire dialog above.
  await expect(page.getByTestId("sparring-request-shortfall")).toContainText("You've used 2 of 2 included AI uses today.");
  await evidence.shot("03-sparring-warns");
  await evidence.aria("03-sparring-warns", page.getByTestId("sparring-request-shortfall"));
});

test("cross-end-early: ending a round before any exchange returns to setup without an error", async ({ signedIn: page, evidence }) => {
  await startCrossfire(page, "mode-question-ai");
  await expect(page.getByTestId("end-crossfire")).toBeVisible();
  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("start-crossfire")).toBeVisible();
  await expect(page.getByText("Complete at least one exchange before ending the session.")).toHaveCount(0);
  await evidence.shot("01-back-in-setup");
});
