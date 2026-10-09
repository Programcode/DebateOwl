import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, providerCalls, test } from "./fixtures";

// Feature map: features/model-defaults.md.
const motion = "This House would make public transport free at the point of use";
const OPUS = "anthropic/claude-opus-5.5";
const HAIKU = "anthropic/claude-haiku-5.5";

async function settings(userId: string) {
  const { data, error } = await admin.from("user_settings").select("feature_configs").eq("user_id", userId).single();
  if (error) throw error;
  return data.feature_configs as Record<string, { model: string }>;
}

async function updateSettings(userId: string, values: Record<string, unknown>) {
  const { error } = await admin.from("user_settings").update(values).eq("user_id", userId);
  if (error) throw error;
}

async function generateOnce(page: Page) {
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await chooseForMotion(page, "once");
  return response;
}

test("model-pro-default: a new Pro account starts on Claude Opus 5.5 and generates with it", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  await expect.poll(async () => (await settings(userId)).generate?.model, { timeout: AI_TIMEOUT }).toBe(OPUS);

  await page.goto("/app/generate");
  const selector = page.getByRole("combobox", { name: "Select AI model for generate" });
  await expect(selector).toContainText("Claude Opus 5.5");
  await selector.click();
  await expect(page.getByRole("option", { name: /Claude Haiku 5\.5/ })).toBeEnabled();
  await expect(page.getByRole("option", { name: /Claude Sonnet 5\.5/ })).toBeEnabled();
  await evidence.shot("01-pro-model-list");
  await page.keyboard.press("Escape");
  await evidence.step("New Pro account: selector shows Claude Opus 5.5, all Claude 5.5 models enabled");

  const body = await generateOnce(page);
  expect((body.meta as { resolvedModel?: string } | undefined)?.resolvedModel ?? OPUS).toBe(OPUS);
  const calls = await providerCalls();
  // Live mode rewrites the upstream model to the pin, so read what the app asked for.
  expect(calls.filter((call) => call.feature === "generate").map((call) => call.requestedModel ?? call.model)).toContain(OPUS);
  const { data: usage } = await admin.from("ai_requests").select("feature,status,model").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success", model: OPUS }));
  await evidence.json("02-ai-requests", usage);
  await evidence.shot("02-generated-with-opus");
});

test("model-basic-default: a Basic account starts on Claude Haiku 5.5 and Pro models stay locked", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  // Demo sign-in grants Pro; turn the account into a fresh trial with nothing saved.
  await updateSettings(userId, {
    subscription_tier: "trial",
    trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    grace_period_ends_at: null,
    daily_limit_override: null,
    feature_configs: {},
  });
  await page.goto("/app/generate");
  await expect.poll(async () => (await settings(userId)).generate?.model, { timeout: AI_TIMEOUT }).toBe(HAIKU);

  const selector = page.getByRole("combobox", { name: "Select AI model for generate" });
  await expect(selector).toContainText("Claude Haiku 5.5");
  await selector.click();
  await expect(page.getByRole("option", { name: /Claude Opus 5\.5/ })).toBeDisabled();
  await expect(page.getByRole("option", { name: /Claude Sonnet 5\.5/ })).toBeDisabled();
  await evidence.shot("01-basic-model-list");
  await page.keyboard.press("Escape");
  await evidence.step("Basic account: selector shows Claude Haiku 5.5, Opus and Sonnet 5.5 locked behind Pro");

  await generateOnce(page);
  const { data: usage } = await admin.from("ai_requests").select("feature,status,model").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success", model: HAIKU }));
  await evidence.json("02-ai-requests", usage);
});

test("model-retired: a saved Claude Sonnet 5 setting moves to Claude Opus 5.5", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  const retired = Object.fromEntries(["generate", "attack", "brainstorm", "factoids", "ask", "sparring"].map((feature) => [
    feature,
    { provider: "openrouter", model: "anthropic/claude-sonnet-5", temperature: 0.7, reasoningEffort: "low" },
  ]));
  await updateSettings(userId, { feature_configs: retired });
  await page.evaluate(() => localStorage.removeItem("debate-trainer-settings"));
  await page.goto("/app/generate");

  await expect(page.getByRole("combobox", { name: "Select AI model for generate" })).toContainText("Claude Opus 5.5");
  await expect.poll(async () => Object.values(await settings(userId)).map((config) => config.model), { timeout: AI_TIMEOUT })
    .toEqual(Array(6).fill(OPUS));
  await evidence.shot("01-retired-migrated");
  await evidence.step("Saved Sonnet 5 configs were rewritten to Opus 5.5 in user_settings");
});
