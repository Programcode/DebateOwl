import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, providerCalls, startDebate, test } from "./fixtures";

// Feature map: features/usage-limits.md.
const motion = "This House would make public transport free at the point of use";

async function openGenerate(page: Page) {
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Ready to Generate" })).toBeVisible();
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

test("usage-weighted: Opus counts as 5 requests, a lighter model still runs, and the monthly cap stops everything", async ({ signedIn: page, user, evidence }) => {
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
  await expect(selector).toContainText("Claude Opus 5.5");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  const daily = page.getByRole("dialog");
  await expect(daily.getByText("Daily Access Paused")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(daily.getByText("This model counts as 5 uses, and you have 4 left today.", { exact: false })).toBeVisible();
  await evidence.shot("01-opus-weighted-refusal");
  expect(await generateCalls()).toBe(0);
  expect(await aiCounter(userId)).toBe(3);
  await evidence.step("Opus refused with 4 units left; no provider call; counter unchanged at 3");
  await daily.getByRole("button", { name: "Not now" }).click();

  await selector.click();
  await page.getByRole("option", { name: /Claude Haiku 5\.5/ }).click();
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await response;
  expect(await generateCalls()).toBe(1);
  expect(await aiCounter(userId)).toBe(4);
  await evidence.shot("02-haiku-runs");
  await evidence.step("Haiku ran and used 1 unit (counter 4)");

  // Reach the monthly budget with spend logged earlier this month.
  const { error: spendError } = await admin.from("ai_requests").insert({
    user_id: userId, feature: "generate", provider: "openrouter", model: "anthropic/claude-opus-5.5", status: "success", cost_usd: 3,
  });
  if (spendError) throw spendError;
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  const monthly = page.getByRole("dialog");
  await expect(monthly.getByText("Monthly AI Allowance Used")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(monthly.getByText("It refreshes on the 1st of next month (UTC).", { exact: false })).toBeVisible();
  await evidence.shot("03-monthly-cap");
  expect(await generateCalls()).toBe(1);
  expect(await aiCounter(userId)).toBe(4);
  await evidence.step("Monthly cap refused the request; no provider call; daily counter unchanged");
  await monthly.getByRole("button", { name: "OK" }).click();
  await expect(monthly).toHaveCount(0);
});

test("usage-monthly-inline: Sparring shows the translated monthly-cap message, not the server's English reason", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  const { error } = await admin.from("ai_requests").insert({
    user_id: userId, feature: "sparring", provider: "openrouter", model: "anthropic/claude-opus-5.5", status: "success", cost_usd: 3,
  });
  if (error) throw error;

  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(motion);
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  const draft = page.getByRole("textbox", { name: "Draft for Affirmative constructive" });
  await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
  await draft.fill("Universal access removes the direct price barrier to work, school, and civic life.");
  await page.getByRole("button", { name: "Submit speech" }).click();

  // The client's catalog copy ("You've used ...") differs from the server reason ("You've reached ...").
  await expect(page.getByText("You've used this month's AI allowance.", { exact: false })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(page.getByText("You've reached this month's AI usage allowance", { exact: false })).toHaveCount(0);
  await evidence.shot("04-sparring-monthly-cap");
  expect((await providerCalls()).filter((call) => call.feature === "sparring")).toEqual([]);
  await evidence.step("Sparring opponent turn refused by the monthly cap with the translated message; no provider call");
});
