import { admin, createDemoUser, deleteDemoUser, expect, expectResult, MARK, providerCall, signIn, stackReady, startDebate, test } from "./stack";
import type { Page } from "@playwright/test";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

async function addSource(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Content", exact: true }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

test("only active Library sources ground AI requests, and deletions persist", async ({ signedIn: page, user }) => {
  await startDebate(page, "Public transport should be free");
  await page.goto("/app/library");
  await addSource(page, "Active study", "ACTIVE-SOURCE-MARKER ridership rose after fares were removed.");
  await addSource(page, "Paused study", "PAUSED-SOURCE-MARKER congestion did not change.");
  await page.getByRole("switch", { name: "Toggle Paused study" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).not.toBeChecked();

  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await expectResult(page, `${MARK} idea 1`);
  const call = await providerCall("brainstorm");
  expect(call.system).toContain("ACTIVE-SOURCE-MARKER");
  expect(call.system).not.toContain("PAUSED-SOURCE-MARKER");

  await page.goto("/app/library");
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Toggle Active study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);

  const { data } = await admin.from("sources").select("title").eq("user_id", await user.userId());
  expect(data?.map((row) => row.title)).toEqual(["Active study"]);
});

test("Delete all my data erases the account's saved work and nobody else's", async ({ signedIn: page, user }) => {
  const other = await createDemoUser("bystander");
  try {
    // A signed-in session creates the bystander's rows, so this also proves the erase is scoped by user.
    const bystander = await (await page.context().browser()!.newContext()).newPage();
    await bystander.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(bystander, other);
    await startDebate(bystander, "Bystander motion");
    await bystander.goto("/app/library");
    await addSource(bystander, "Bystander study", "Kept after another account erases its data.");
    await bystander.context().close();

    await startDebate(page, "My motion");
    await page.goto("/app/library");
    await addSource(page, "My study", "Erased with the account data.");
    const userId = await user.userId();
    const otherId = await other.userId();

    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Delete all my data" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Type your email to confirm").fill(user.email);
    await dialog.getByRole("button", { name: "Delete all my data" }).click();
    await expect(page.getByText("Data Deleted").first()).toBeVisible();

    const { data: mine } = await admin.from("sources").select("id").eq("user_id", userId);
    expect(mine).toEqual([]);
    const { data: myDebates } = await admin.from("debates").select("id").eq("user_id", userId);
    expect(myDebates).toEqual([]);
    const { data: theirs } = await admin.from("sources").select("title").eq("user_id", otherId);
    expect(theirs?.map((row) => row.title)).toEqual(["Bystander study"]);

    await page.goto("/app/library");
    await expect(page.getByRole("switch", { name: "Toggle My study" })).toHaveCount(0);
  } finally {
    await deleteDemoUser(other);
  }
});

test("the output language setting follows the account and reaches the model", async ({ signedIn: page, user, browser }) => {
  await page.goto("/app/settings");
  await page.getByRole("combobox", { name: "AI Output Language" }).click();
  await page.getByRole("option", { name: "Magyar" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("user_settings").select("output_language").eq("user_id", await user.userId()).single();
    return data?.output_language;
  }).toBe("hu");

  // A new device starts with English defaults and must hydrate from the account.
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(other, user);
    await other.goto("/app/attack");
    await other.getByLabel("Your Argument *").fill("Free transit cuts congestion.");
    await other.getByRole("button", { name: "Find weaknesses" }).click();
    await expect(other.getByText(`${MARK} weakness`)).toBeVisible({ timeout: 30_000 });
    expect((await providerCall("attack")).user).toContain("Language: Hungarian (hu)");
  } finally {
    await context.close();
  }
});

test("a saved flowchart is stored on the account", async ({ signedIn: page, user }) => {
  const title = `Flow ${Date.now()}`;
  await page.goto("/app/flowchart");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Save Flowchart" }).click();
  await expect(page.getByText("Flowchart saved successfully")).toBeVisible();

  const { data } = await admin.from("flowcharts").select("title").eq("user_id", await user.userId());
  expect(data?.map((row) => row.title)).toEqual([title]);
});
