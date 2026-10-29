import type { Page, Route } from "@playwright/test";
import { admin, AI_TIMEOUT, chooseForMotion, expect, startDebate, test } from "./fixtures";

// Feature map: features/ai-failures.md. Each failure is forced in the browser,
// so the provider is never called and the recipe runs the same in both modes.
const motion = "This House would make public transport free at the point of use";
const resolution = "Resolved: cities should ban private cars downtown.";

/** Answers every `ai` request except a round's quota check as the server does for a refused session. */
async function refuseSession(page: Page): Promise<void> {
  await page.route("**/functions/v1/ai", async (route: Route) => {
    if (route.request().method() === "POST" && (route.request().postDataJSON() as { quotaCheck?: boolean } | null)?.quotaCheck) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Invalid JWT" }) });
  });
}

async function expectBackOnLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login$/, { timeout: AI_TIMEOUT });
  await expect(page.getByRole("status").filter({ hasText: "Your session expired. Sign in again." })).toBeVisible();
}

test("fail-signin-tool: a refused session on Generate offers Sign in again, not Retry, and it opens the login page", async ({ signedIn: page, evidence }) => {
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await refuseSession(page);
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const failure = page.getByRole("alert").filter({ hasText: "Sign-in required" });
  await expect(failure).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(failure.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await evidence.shot("01-generate-sign-in-again");
  await evidence.aria("01-generate-sign-in-again", failure);

  await failure.getByRole("button", { name: "Sign in again" }).click();
  await expectBackOnLogin(page);
  await evidence.shot("02-login-after-sign-in-again");
});

test("fail-network-ask: a question that never reached the server stays with Retry, and Retry answers it once", async ({ signedIn: page, evidence }) => {
  const question = "What is the strongest objection to free public transport?";
  await page.goto("/app/ask");
  await page.route("**/functions/v1/ai-stream", (route) => route.abort("internetdisconnected"));
  await page.route("**/functions/v1/ai", (route) => route.abort("internetdisconnected"));
  await page.getByRole("textbox", { name: "Message to your debate coach" }).fill(question);
  await page.keyboard.press("Enter");
  const failure = page.getByRole("alert").filter({ hasText: "Check your connection and try again." });
  await expect(failure).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-ask-network-retry");
  await evidence.aria("01-ask-network-retry", failure);

  await page.unroute("**/functions/v1/ai-stream");
  await page.unroute("**/functions/v1/ai");
  const answer = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: AI_TIMEOUT });
  await failure.getByRole("button", { name: "Retry" }).click();
  await answer;
  await expect(failure).toHaveCount(0);
  await expect(page.getByText(question)).toHaveCount(1);
  await evidence.shot("02-ask-answered-after-retry");
});

test("fail-signin-ask: a refused session in Ask offers Sign in again", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/ask");
  await page.route("**/functions/v1/ai-stream", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Invalid JWT" }) }));
  await refuseSession(page);
  await page.getByRole("textbox", { name: "Message to your debate coach" }).fill("How do I weigh two impacts?");
  await page.keyboard.press("Enter");
  const failure = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Sign in again" }) });
  await expect(failure).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(failure.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await evidence.shot("01-ask-sign-in-again");
  await evidence.aria("01-ask-sign-in-again", failure);
});

test("fail-limit-tool: a tool refused by the daily limit opens the plan dialog", async ({ signedIn: page, user, evidence }) => {
  await admin.from("user_settings").update({ daily_limit_override: 0 }).eq("user_id", await user.userId());
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / topic *").fill(motion);
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await chooseForMotion(page, "once");
  const dialog = page.getByRole("dialog").filter({ hasText: "Daily AI uses used up" });
  await expect(dialog).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-brainstorm-limit-dialog");
  await evidence.aria("01-brainstorm-limit-dialog", dialog);
});

test("fail-signin-sparring: a refused session for the opponent's turn offers Sign in again instead of Retry", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill(motion);
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await chooseForMotion(page, "create");
  const draft = page.getByRole("textbox", { name: "Draft for Affirmative constructive" });
  await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
  await refuseSession(page);
  await draft.fill("Universal access removes the direct price barrier to participation in work, school, and civic life.");
  await page.getByRole("button", { name: "Submit speech" }).click();
  await expect(page.getByRole("heading", { name: "The opponent could not answer" })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(page.getByRole("button", { name: "Retry opponent turn" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible();
  await evidence.shot("01-sparring-sign-in-again");
});

test("fail-signin-crossfire: a refused session for the AI's question offers Sign in again instead of Retry", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill(resolution);
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId("mode-ai-questions-user").click();
  await refuseSession(page);
  await page.getByTestId("start-crossfire").click();
  await chooseForMotion(page, "create");
  await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(page.getByTestId("retry-ai")).toHaveCount(0);
  await evidence.shot("01-crossfire-sign-in-again");
});
