import { admin, expect, MARK, providerCall, signIn, stackReady, test } from "./stack";
import type { Page } from "@playwright/test";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

async function addSource(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Source title..." }).fill(title);
  await page.getByRole("textbox", { name: "Paste source content..." }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

test("only active Library sources ground AI requests, and deletions persist", async ({ signedIn: page, user }) => {
  await page.goto("/app/library");
  await addSource(page, "Active study", "ACTIVE-SOURCE-MARKER ridership rose after fares were removed.");
  await addSource(page, "Paused study", "PAUSED-SOURCE-MARKER congestion did not change.");
  await page.getByRole("switch", { name: "Toggle Paused study" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).not.toBeChecked();

  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await expect(page.getByText(`${MARK} idea 1`)).toBeVisible({ timeout: 30_000 });
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

test("the output language setting follows the account and reaches the model", async ({ signedIn: page, user, browser }) => {
  await page.goto("/app/settings");
  await page.locator("div.space-y-2", { has: page.getByText("AI Output Language", { exact: true }) }).getByRole("combobox").click();
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
    await other.getByRole("button", { name: "Find Weaknesses" }).click();
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
