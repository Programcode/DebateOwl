import { admin, expect, fake, stackReady, test } from "../full-stack/stack";
import { aiResponse, expectProviderCallsHealthy, LIVE_TIMEOUT } from "./live";

test.skip(!stackReady, "Live gate is required (LIVE_PROVIDERS=1 ./.superset/db-gate.sh)");
test.describe.configure({ timeout: LIVE_TIMEOUT + 60_000 });

test("Ask streams a live answer", async ({ signedIn: page }) => {
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask your debate coach...").fill("In two sentences, how should I weigh access against cost?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect.poll(async () => (await fake.requests()).some((call) => call.feature === "ask-stream" && (call as { status?: number }).status === 200), { timeout: LIVE_TIMEOUT }).toBe(true);
  // The client falls back to the structured endpoint if streaming fails.
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: LIVE_TIMEOUT });
  expect((await fake.requests()).map((call) => call.feature)).not.toContain("ask");
  await expectProviderCallsHealthy(["ask-stream"]);
});

test("Attack and Brainstorm return valid structured analyses", async ({ signedIn: page }) => {
  await page.goto("/app/attack");
  await page.getByLabel("Your Argument *").fill("Free transit cuts congestion because riders leave their cars at home, so cities should abolish fares.");
  const attack = aiResponse(page, "attack");
  await page.getByRole("button", { name: "Find Weaknesses" }).click();
  expect(((await attack).output.weaknesses as unknown[]).length).toBeGreaterThan(0);

  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Universal basic income should replace targeted welfare");
  const brainstorm = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  expect(((await brainstorm).output.topFive as unknown[]).length).toBeGreaterThan(0);
  await expectProviderCallsHealthy(["attack", "brainstorm"]);
});

test("a live sparring round is judged and saved", async ({ signedIn: page, user }) => {
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill("This House would make public transport free at the point of use.");
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();

  const speeches = [
    ["Affirmative constructive", "Universal access removes the direct price barrier to participation in work, school, and civic life."],
    ["First affirmative rebuttal", "Targeted discounts leave eligibility gaps and add administrative friction that keeps poor riders out."],
    ["Second affirmative rebuttal", "Weigh reliability: the universal policy covers every marginal trip, while targeting misses many of them."],
  ] as const;
  for (const [turn, content] of speeches) {
    const draft = page.getByRole("textbox", { name: `Draft for ${turn}` });
    await expect(draft).toBeVisible({ timeout: LIVE_TIMEOUT });
    await draft.fill(content);
    await page.getByRole("button", { name: "Submit speech" }).click();
  }

  await expect(page.getByRole("heading", { name: "Here is what happened in the room." })).toBeVisible({ timeout: LIVE_TIMEOUT });
  await expect.poll(async () => {
    const { data } = await admin.from("sparring_sessions").select("status").eq("user_id", await user.userId());
    return data?.map((row) => row.status);
  }).toEqual(["complete"]);
  await expectProviderCallsHealthy(["sparring"]);
});

test("Crossfire answers live and produces a debrief", async ({ signedIn: page }) => {
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill("Resolved: cities should ban private cars downtown.");
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId("mode-question-ai").click();
  await page.getByTestId("start-crossfire").click();

  await page.getByTestId("crossfire-input").fill("What evidence links fewer private cars to safer streets?");
  const turn = aiResponse(page, "crossfire");
  await page.getByTestId("submit-turn").click();
  const answer = (await turn).output as { type: string; text: string };
  expect(answer.type).toBe("answer");
  await expect(page.getByText(answer.text.slice(0, 40), { exact: false })).toBeVisible();

  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: LIVE_TIMEOUT });
  await expectProviderCallsHealthy(["crossfire"]);
});
