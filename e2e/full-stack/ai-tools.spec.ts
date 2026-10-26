import { admin, chooseForMotion, expect, expectResult, fake, MARK, providerCall, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

test("Attack analyses a pasted case", async ({ signedIn: page }) => {
  await page.goto("/app/attack");
  await page.getByLabel("Your Argument *").fill("Free transit cuts congestion because riders leave their cars at home.");
  await page.getByRole("button", { name: "Find weaknesses" }).click();

  await expectResult(page, `${MARK} weakness`);
  expect((await providerCall("attack")).user).toContain("riders leave their cars at home");
});

test("Brainstorm returns ranked angles", async ({ signedIn: page }) => {
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Universal basic income should replace targeted welfare");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await chooseForMotion(page, "create");

  await expectResult(page, `${MARK} idea 1`);
  expect((await providerCall("brainstorm")).user).toContain("Motion: Universal basic income should replace targeted welfare");
});

test("Factoids completes research without verified web sources", async ({ signedIn: page }) => {
  await page.goto("/app/factoids");
  await page.getByLabel("Statement *").fill("Fare-free transit raises ridership");
  await page.getByRole("button", { name: "Find Factoids" }).click();

  // The local stack has no search key, so the server must drop every unverified
  // factoid and still finish instead of inventing citations.
  await expectResult(page, `${MARK} search suggestion`);
  expect((await providerCall("factoids")).user).toContain('"Fare-free transit raises ridership"');
});

test("Ask streams a coaching answer and records usage", async ({ signedIn: page, user }) => {
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask your debate coach...").fill("How do I weigh access against cost?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(`${MARK} streamed answer: weigh access against cost.`)).toBeVisible({ timeout: 30_000 });
  // The client silently falls back to the non-streaming path when streaming
  // fails, so prove the answer really came through ai-stream.
  const features = (await fake.requests()).map((request) => request.feature);
  expect(features).toContain("ask-stream");
  expect(features).not.toContain("ask");

  const userId = await user.userId();
  await expect.poll(async () => {
    const { data } = await admin.from("ai_requests").select("feature,status").eq("user_id", userId);
    return data;
  }).toContainEqual(expect.objectContaining({ feature: "ask", status: "success" }));
});

test("Ask with citations uses the structured endpoint", async ({ signedIn: page }) => {
  await page.goto("/app/ask");
  // The Ask switches live in the Options popover above the message box.
  await page.getByRole("button", { name: "Options" }).click();
  await page.locator("#citation-mode").click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Ask your debate coach...").fill("Which evidence supports fare-free transit?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(`${MARK} answer`)).toBeVisible({ timeout: 30_000 });
  expect((await providerCall("ask")).user).toContain("Which evidence supports fare-free transit?");
});
