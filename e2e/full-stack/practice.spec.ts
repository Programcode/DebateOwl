import { admin, expect, MARK, providerCall, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

test("a Lincoln-Douglas sparring round is judged and saved", async ({ signedIn: page, user }) => {
  await page.goto("/app/sparring");
  await page.getByLabel("Motion").fill("This House would make public transport free at the point of use.");
  await page.getByRole("combobox", { name: "Round format" }).click();
  await page.getByRole("option", { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();

  const speeches = [
    ["Affirmative constructive", "Universal access removes the direct price barrier to participation."],
    ["First affirmative rebuttal", "Targeted discounts preserve eligibility gaps and administrative friction."],
    ["Second affirmative rebuttal", "The universal policy covers every marginal trip, so it is more reliable."],
  ] as const;
  for (const [turn, content] of speeches) {
    await page.getByRole("textbox", { name: `Draft for ${turn}` }).fill(content);
    await page.getByRole("button", { name: "Submit speech" }).click();
    if (turn !== "Second affirmative rebuttal") {
      // Opponent speeches carry a server-signed integrity token; the score
      // request below is rejected if the client cannot round-trip them.
      await expect(page.getByText(`${MARK} opponent speech`).last()).toBeVisible({ timeout: 30_000 });
    }
  }

  await expect(page.getByText(`${MARK} verdict: the user had the edge.`)).toBeVisible({ timeout: 30_000 });
  expect((await providerCall("sparring")).user).toContain("SPARRING ACTION:");

  await expect.poll(async () => {
    const { data } = await admin.from("sparring_sessions").select("status,final_evaluation").eq("user_id", await user.userId());
    return data?.map((row) => row.status);
  }).toEqual(["complete"]);
});

test("Crossfire answers a question and produces a debrief", async ({ signedIn: page }) => {
  await page.goto("/app/crossfire");
  await page.getByTestId("crossfire-resolution").fill("Resolved: cities should ban private cars downtown.");
  await page.getByTestId("crossfire-argument").fill("Private cars create congestion and unsafe streets.");
  await page.getByTestId("mode-question-ai").click();
  await page.getByTestId("start-crossfire").click();

  await page.getByTestId("crossfire-input").fill("What evidence supports the safety mechanism?");
  await page.getByTestId("submit-turn").click();
  await expect(page.getByText(`${MARK} crossfire answer`)).toBeVisible({ timeout: 30_000 });
  expect((await providerCall("crossfire")).user).toContain("What evidence supports the safety mechanism?");

  await page.getByTestId("end-crossfire").click();
  await expect(page.getByTestId("crossfire-debrief")).toBeVisible({ timeout: 30_000 });
});
