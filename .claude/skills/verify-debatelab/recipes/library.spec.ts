import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, expect, expectProviderCalls, startDebate, test } from "./fixtures";

// Feature map: features/library-sources.md. The Library belongs to the Current
// Debate: `Add Source` stays disabled until one exists, so each test starts one.
const motion = "Public transport should be free";

async function addSource(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Content", exact: true }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

test("lib-add, lib-toggle, lib-ground, lib-delete: only active sources ground AI requests, and deletions persist", async ({ signedIn: page, user, evidence }) => {
  await startDebate(page, motion);
  await evidence.step(`Started the debate "${motion}" from the header`);
  await page.goto("/app/library");
  await expect(page.getByTestId("library-debate")).toContainText(motion);
  await addSource(page, "Active study", "ACTIVE-SOURCE-MARKER ridership rose after fares were removed in Tallinn.");
  await addSource(page, "Paused study", "PAUSED-SOURCE-MARKER congestion did not change.");
  await page.getByRole("switch", { name: "Toggle Paused study" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).not.toBeChecked();
  await evidence.step("Added two sources and paused one");
  await evidence.shot("01-library");

  // Brainstorm prefills the Current Debate's motion, so no motion check opens.
  await page.goto("/app/brainstorm");
  await expect(page.getByLabel("Motion / Topic *")).toHaveValue(motion);
  const response = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await response;
  const call = (await expectProviderCalls(["brainstorm"])).find((item) => item.feature === "brainstorm")!;
  expect(call.system).toContain("ACTIVE-SOURCE-MARKER");
  expect(call.system).not.toContain("PAUSED-SOURCE-MARKER");
  await evidence.json("02-grounding", { activeInPrompt: true, pausedInPrompt: false });

  await page.goto("/app/library");
  // Deleting a source acts at once; the toast's Undo saves it again.
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(1);
  await evidence.step("Deleted Paused study, then restored it with Undo");
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Toggle Active study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  // Live research can save the web sources it found, so check only the two added here.
  const userId = await user.userId();
  const { data: debate } = await admin.from("debates").select("id").eq("user_id", userId).eq("motion", motion).single();
  const { data } = await admin.from("sources").select("title,is_active,debate_id").eq("user_id", userId).in("title", ["Active study", "Paused study"]);
  expect(data).toEqual([{ title: "Active study", is_active: true, debate_id: debate?.id }]);
  await evidence.json("03-sources-rows", data);
  await evidence.shot("03-after-delete");
});

test("lib-import: a web page imports into the Library", async ({ signedIn: page, user, evidence }) => {
  const url = "https://en.wikipedia.org/wiki/Free_public_transport";
  await startDebate(page, motion);
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Import from URL" }).fill(url);
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByText("Import preview", { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-import-ready");
  await page.getByRole("button", { name: "Save imported source" }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("sources").select("origin,content").eq("user_id", await user.userId());
    return data?.map((row) => ({ origin: row.origin, long: row.content.length > 2_000 }));
  }).toEqual([{ origin: url, long: true }]);
  const { data } = await admin.from("sources").select("title,origin").eq("user_id", await user.userId());
  await evidence.json("02-imported-row", data);
});
