import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, expect, expectProviderCalls, test } from "./fixtures";

// Feature map: features/library-sources.md.

async function addSource(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Source title..." }).fill(title);
  await page.getByRole("textbox", { name: "Paste source content..." }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

test("lib-add, lib-toggle, lib-ground, lib-delete: only active sources ground AI requests, and deletions persist", async ({ signedIn: page, user, evidence }) => {
  await page.goto("/app/library");
  await addSource(page, "Active study", "ACTIVE-SOURCE-MARKER ridership rose after fares were removed in Tallinn.");
  await addSource(page, "Paused study", "PAUSED-SOURCE-MARKER congestion did not change.");
  await page.getByRole("switch", { name: "Toggle Paused study" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).not.toBeChecked();
  await evidence.step("Added two sources and paused one");
  await evidence.shot("01-library");

  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("Public transport should be free");
  const response = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await response;
  const call = (await expectProviderCalls(["brainstorm"])).find((item) => item.feature === "brainstorm")!;
  expect(call.system).toContain("ACTIVE-SOURCE-MARKER");
  expect(call.system).not.toContain("PAUSED-SOURCE-MARKER");
  await evidence.json("02-grounding", { activeInPrompt: true, pausedInPrompt: false });

  await page.goto("/app/library");
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Toggle Active study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  // Live research can save the web sources it found, so check only the two added here.
  const { data } = await admin.from("sources").select("title,is_active").eq("user_id", await user.userId()).in("title", ["Active study", "Paused study"]);
  expect(data?.map((row) => row.title)).toEqual(["Active study"]);
  await evidence.json("03-sources-rows", data);
  await evidence.shot("03-after-delete");
});

test("lib-import: a web page imports into the Library", async ({ signedIn: page, user, evidence }) => {
  const url = "https://en.wikipedia.org/wiki/Free_public_transport";
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Import from URL" }).fill(url);
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByText("Source Ready", { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-import-ready");
  await page.getByRole("button", { name: "Save imported source" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("sources").select("origin,content").eq("user_id", await user.userId());
    return data?.map((row) => ({ origin: row.origin, long: row.content.length > 2_000 }));
  }).toEqual([{ origin: url, long: true }]);
  const { data } = await admin.from("sources").select("title,origin").eq("user_id", await user.userId());
  await evidence.json("02-imported-row", data);
});
