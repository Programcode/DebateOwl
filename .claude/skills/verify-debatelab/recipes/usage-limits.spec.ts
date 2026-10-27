import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, fake, LIVE, providerCalls, startDebate, test } from "./fixtures";

// Feature map: features/usage-limits.md.
const motion = "This House would make public transport free at the point of use";

async function openGenerate(page: Page) {
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Your case will appear here" })).toBeVisible();
}

async function aiCounter(userId: string): Promise<number> {
  const { data, error } = await admin.from("daily_usage_counters").select("request_count")
    .eq("user_id", userId).eq("quota_key", "ai").eq("usage_date", new Date().toISOString().slice(0, 10)).maybeSingle();
  if (error) throw error;
  return data?.request_count ?? 0;
}

async function generateCalls(): Promise<number> {
  return (await providerCalls()).filter((call) => call.feature === "generate").length;
}

test("usage-weighted: Opus counts as 5 requests, a lighter model still runs, and the weekly cap stops everything", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  // Demo users are Pro on Claude Opus 5.5 with a limit of 999. Leave room for
  // 4 more units today: too few for Opus, enough for Haiku.
  await admin.from("user_settings").update({ daily_limit_override: 7 }).eq("user_id", userId);
  const { error: seedError } = await admin.from("daily_usage_counters").insert({
    user_id: userId, usage_date: new Date().toISOString().slice(0, 10), quota_key: "ai", request_count: 3,
  });
  if (seedError) throw seedError;

  await openGenerate(page);
  const selector = page.getByRole("combobox", { name: "Select AI model for generate" });
  // Demo users default to Sonnet (20261022120000_opus_default_to_sonnet.sql); pick Opus.
  await selector.click();
  await page.getByRole("option", { name: /Claude Opus 5\.5/ }).click();
  await expect(selector).toContainText("Claude Opus 5.5");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const daily = page.getByRole("dialog");
  await expect(daily.getByText("Daily AI uses used up")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(daily.getByText("This model counts as 5 uses, and you have 4 left today.", { exact: false })).toBeVisible();
  await evidence.shot("01-opus-weighted-refusal");
  expect(await generateCalls()).toBe(0);
  expect(await aiCounter(userId)).toBe(3);
  await evidence.step("Opus refused with 4 units left; no provider call; counter unchanged at 3");
  // Pro accounts get OK, others Not now; Escape closes either.
  await page.keyboard.press("Escape");
  await expect(daily).toHaveCount(0);

  await selector.click();
  await page.getByRole("option", { name: /Claude Haiku 5\.5/ }).click();
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  await response;
  expect(await generateCalls()).toBe(1);
  expect(await aiCounter(userId)).toBe(4);
  await evidence.shot("02-haiku-runs");
  await evidence.step("Haiku ran and used 1 unit (counter 4)");

  // Reach the weekly budget with cap spend logged earlier this week.
  const { error: spendError } = await admin.from("ai_requests").insert({
    user_id: userId, feature: "generate", provider: "openrouter", model: "anthropic/claude-opus-5.5", status: "success", cost_usd: 2, cap_cost_usd: 2,
  });
  if (spendError) throw spendError;
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const weekly = page.getByRole("dialog");
  await expect(weekly.getByText("Weekly AI allowance used")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(weekly.getByText("It refreshes on Monday at 00:00 UTC.", { exact: false })).toBeVisible();
  await evidence.shot("03-weekly-cap");
  expect(await generateCalls()).toBe(1);
  expect(await aiCounter(userId)).toBe(4);
  await evidence.step("Weekly cap refused the request; no provider call; daily counter unchanged");
  await weekly.getByRole("button", { name: "OK" }).click();
  await expect(weekly).toHaveCount(0);
});

test("usage-weekly-sparring: with the week's allowance used, Sparring says so before a round and never opens one", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  const { error } = await admin.from("ai_requests").insert({
    user_id: userId, feature: "sparring", provider: "openrouter", model: "anthropic/claude-opus-5.5", status: "success", cost_usd: 2, cap_cost_usd: 2,
  });
  if (error) throw error;

  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(motion);
  // The setup asks the server first and shows the catalog's words, not the server's English reason.
  await expect(page.getByTestId("session-cost")).toContainText("You've used this week's AI allowance.", { timeout: AI_TIMEOUT });
  await expect(page.getByText("You've reached this week's AI usage allowance", { exact: false })).toHaveCount(0);
  await evidence.shot("04-sparring-weekly-before-start");
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  await expect(page.getByRole("dialog").getByText("Weekly AI allowance used")).toBeVisible({ timeout: AI_TIMEOUT });
  // No round opened, so no speech can be written into a round the server would refuse.
  await expect(page.getByRole("textbox", { name: /^Draft for / })).toHaveCount(0);
  expect((await providerCalls()).filter((call) => call.feature === "sparring")).toEqual([]);
  await evidence.step("Sparring refused at Start by the weekly cap with the translated message; no round, no provider call");
});

async function sessionRow(userId: string, feature: string) {
  const { data, error } = await admin.from("ai_quota_sessions").select("charged,units,calls_used").eq("user_id", userId).eq("feature", feature);
  if (error) throw error;
  return data;
}

test("usage-session-sparring: with one request left, a whole Sparring round (every reply and the judge) runs for one use", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  // QB-01: a trial-sized day (5) with 4 already used. Per call, the round would
  // stop at the second reply; per round it finishes.
  await admin.from("user_settings").update({ daily_limit_override: 5 }).eq("user_id", userId);
  const { error: seedError } = await admin.from("daily_usage_counters").insert({
    user_id: userId, usage_date: new Date().toISOString().slice(0, 10), quota_key: "ai", request_count: 4,
  });
  if (seedError) throw seedError;

  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(motion);
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("combobox", { name: "Select AI model for sparring" }).click();
  await page.getByRole("option", { name: /Claude Haiku 5\.5/ }).click();
  const cost = page.getByTestId("session-cost");
  await expect(cost).toHaveText("This round costs 1 AI use, however many turns it takes. You have 1 left today.", { timeout: AI_TIMEOUT });
  await evidence.shot("01-sparring-cost-before-start");
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");

  for (const [turn, content] of [
    ["Affirmative constructive", "Universal access removes the direct price barrier to participation in work, school, and civic life."],
    ["First affirmative rebuttal", "Targeted discounts leave eligibility gaps and add administrative friction that keeps poor riders out."],
    ["Second affirmative rebuttal", "Weigh reliability: the universal policy covers every marginal trip, while targeting misses many of them."],
  ] as const) {
    const draft = page.getByRole("textbox", { name: `Draft for ${turn}` });
    await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
    await draft.fill(content);
    await page.getByRole("button", { name: "Submit speech" }).click();
  }
  await expect(page.getByRole("heading", { name: "Here is what happened in the room." })).toBeVisible({ timeout: AI_TIMEOUT * 2 });
  await evidence.shot("02-sparring-judged-on-one-use");
  const calls = (await providerCalls()).filter((call) => call.feature === "sparring");
  expect(calls.length).toBe(3);
  expect(await aiCounter(userId)).toBe(5);
  expect(await sessionRow(userId, "sparring")).toEqual([{ charged: true, units: 1, calls_used: 3 }]);
  await evidence.step("Two opponent replies and the judge ran on the last request of the day; the counter moved 4 -> 5 once");
});

test("usage-session-crossfire: a Crossfire round (opening, answers, debrief) is charged once", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill(motion);
  await page.getByTestId("crossfire-argument").fill("Free fares remove the price barrier for the poorest riders.");
  await page.getByTestId("mode-ai-questions-user").click();
  await expect(page.getByTestId("session-cost")).toContainText("however many turns it takes.", { timeout: AI_TIMEOUT });
  await evidence.shot("01-crossfire-cost-before-start");
  const opening = aiResponse(page, "crossfire", "next-turn");
  await page.getByTestId("start-crossfire").click();
  await chooseForMotion(page, "create");
  await opening;
  // MD-03: once the round runs, the setup hint is gone.
  await expect(page.getByText("Set a resolution and an argument to start a focused cross-examination.")).toHaveCount(0);
  const units = (await sessionRow(userId, "crossfire"))?.[0]?.units ?? 0;
  expect(units).toBeGreaterThan(0);
  expect(await aiCounter(userId)).toBe(units);

  for (const answer of ["Fare revenue covers a small share of operating cost in most systems.", "Ridership gains offset congestion costs downtown."]) {
    await page.getByTestId("crossfire-input").fill(answer);
    const next = aiResponse(page, "crossfire", "next-turn");
    await page.getByTestId("submit-turn").click();
    await next;
  }
  const debrief = aiResponse(page, "crossfire", "debrief");
  await page.getByTestId("end-crossfire").click();
  await debrief;
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("02-crossfire-debrief");
  expect(await aiCounter(userId)).toBe(units);
  expect(await sessionRow(userId, "crossfire")).toEqual([{ charged: true, units, calls_used: 4 }]);
  await evidence.step(`Opening question, two answers and the debrief: four calls, one charge of ${units}`);
});

test("usage-refund-reload: reloading while Brainstorm streams costs nothing", async ({ signedIn: page, user, evidence }) => {
  test.skip(LIVE, "only the fake provider can hold a reply mid-stream");
  const userId = await user.userId();
  await fake.streamDelay(1_500);
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / topic *").fill(motion);
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await chooseForMotion(page, "create");
  // The run is reserved and streaming: the counter shows it.
  await expect.poll(() => aiCounter(userId), { timeout: AI_TIMEOUT }).toBeGreaterThan(0);
  await expect.poll(async () => (await providerCalls()).some((call) => call.feature === "brainstorm"), { timeout: AI_TIMEOUT }).toBe(true);
  await evidence.shot("01-brainstorm-streaming");
  await page.reload();
  await expect.poll(async () => {
    const { data } = await admin.from("ai_requests").select("status,error_code").eq("user_id", userId).eq("feature", "brainstorm");
    return data;
  }, { timeout: AI_TIMEOUT }).toEqual([{ status: "cancelled", error_code: "aborted" }]);
  expect(await aiCounter(userId)).toBe(0);
  await evidence.step("Reload mid-stream: the run was logged cancelled/aborted and its units given back (counter 0)");
});

test("usage-ask-not-sent: a question refused by the daily limit stays, marked Not sent, and Retry sends it once", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  await admin.from("user_settings").update({ daily_limit_override: 2 }).eq("user_id", userId);
  const { error: seedError } = await admin.from("daily_usage_counters").insert({
    user_id: userId, usage_date: new Date().toISOString().slice(0, 10), quota_key: "ai", request_count: 2,
  });
  if (seedError) throw seedError;
  const question = "What is the strongest objection to free public transport?";
  await page.goto("/app/ask");
  await page.getByRole("textbox", { name: "Message to your debate coach" }).fill(question);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: AI_TIMEOUT });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const notSent = page.getByRole("alert").filter({ hasText: "Not sent: daily limit reached" });
  await expect(notSent).toBeVisible();
  await expect(page.getByText(question).first()).toBeVisible();
  await evidence.shot("01-ask-not-sent");
  await evidence.aria("01-ask-not-sent", notSent);

  await admin.from("user_settings").update({ daily_limit_override: 20 }).eq("user_id", userId);
  // Plain Ask answers stream from ai-stream.
  const answer = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: AI_TIMEOUT });
  await notSent.getByRole("button", { name: "Retry" }).click();
  await answer;
  await expect(notSent).toHaveCount(0);
  await expect(page.getByText(question)).toHaveCount(1);
  await evidence.shot("02-ask-retried");
});
