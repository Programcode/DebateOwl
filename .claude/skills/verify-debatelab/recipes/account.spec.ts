import { admin, AI_TIMEOUT, aiResponse, expect, expectProviderCalls, signIn, test } from "./fixtures";

// Feature map: the Account entry in features/README.md. Export and account
// deletion are recipes/account-data.spec.ts (features/account-data.md). Delete
// All My Data and the plain flowchart save are covered by
// e2e/full-stack/account-data.spec.ts, which drive also runs.

test("acct-language: the output language follows the account to a new device and reaches the model", async ({ signedIn: page, user, browser, evidence }) => {
  await page.goto("/app/settings");
  await page.getByRole("combobox", { name: "AI output language" }).click();
  await page.getByRole("option", { name: "Magyar" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("user_settings").select("output_language").eq("user_id", await user.userId()).single();
    return data?.output_language;
  }).toBe("hu");
  await evidence.shot("01-settings-hungarian");

  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(other, user);
    await other.goto("/app/attack");
    await other.getByLabel("Your argument *").fill("Free transit cuts congestion because riders leave their cars at home.");
    const response = aiResponse(other, "attack");
    await other.getByRole("button", { name: "Find weaknesses" }).click();
    const body = await response;
    await evidence.json("02-attack-response", body);
    const call = (await expectProviderCalls(["attack"])).find((item) => item.feature === "attack")!;
    expect(call.user).toContain("Language: Hungarian (hu)");
    await evidence.shot("02-attack-in-hungarian", other);
  } finally {
    await context.close();
  }
});

test("flow-edit: a flowchart node is deleted, the chart is saved, and it loads back", async ({ signedIn: page, user, evidence }) => {
  const title = `Verify flow ${Date.now()}`;
  await page.goto("/app/flowchart");
  await page.getByText("Argument 1", { exact: true }).first().click();
  // A node can be put back exactly, so it deletes at once and the toast offers Undo.
  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("Argument 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Argument 1", { exact: true })).toHaveCount(1);
  await evidence.step("Deleted Argument 1, then restored it with Undo");
  await page.getByText("Argument 1", { exact: true }).first().click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(page.getByText("Argument 1", { exact: true })).toHaveCount(0);
  await evidence.shot("01-node-deleted");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Save flowchart" }).click();
  await expect(page.getByText("Flowchart saved").first()).toBeVisible();
  const { data } = await admin.from("flowcharts").select("title,nodes").eq("user_id", await user.userId());
  expect(data?.map((row) => row.title)).toEqual([title]);
  expect(JSON.stringify(data?.[0].nodes)).not.toContain("Argument 1");
  await evidence.json("02-flowchart-row", data);

  await page.reload();
  await page.getByRole("button", { name: "Load" }).click();
  await page.getByText(title).first().click();
  await expect(page.getByText("Argument 1", { exact: true })).toHaveCount(0);
  await evidence.shot("03-loaded");
});

test("timer-run: the speech timer starts, pauses, and resets", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/timer");
  const display = page.getByRole("timer", { name: "Timer display" });
  const initial = await display.textContent();
  // Exact: the header's "Start debate" button also matches a substring "Start".
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("SPEAKING").first()).toBeVisible();
  await expect.poll(() => display.textContent(), { timeout: 5_000 }).not.toBe(initial);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("PAUSED").first()).toBeVisible();
  const paused = await display.textContent();
  // eslint-disable-next-line no-restricted-properties -- observation window: a paused timer must not change.
  await page.waitForTimeout(1_500);
  expect(await display.textContent()).toBe(paused);
  await evidence.shot("01-paused");
  // Timer shortcuts ignore a focused button (#172), and Pause still has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("r");
  await expect(display).toHaveText(initial!);
  await evidence.shot("02-reset");
});
