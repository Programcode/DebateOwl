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
  const userId = await user.userId();
  const pausedRow = async () =>
    ((await admin.from("sources").select("id,created_at,is_active").eq("user_id", userId).eq("title", "Paused study")).data ?? [])
      // The client keeps milliseconds; Postgres keeps microseconds.
      .map((row) => ({ id: row.id, at: Math.floor(Date.parse(row.created_at)), active: row.is_active }));
  const before = await pausedRow();
  expect(before).toHaveLength(1);
  // Deleting a source acts at once; the toast's Undo puts the same row back (same id, so a
  // per-request exclusion still applies, and the same date, so it keeps its place).
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await expect.poll(pausedRow).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(1);
  await expect.poll(pausedRow).toEqual(before);
  await evidence.step("Deleted Paused study, then restored the same row with Undo");
  await page.getByRole("button", { name: "Delete Paused study", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Toggle Active study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Paused study" })).toHaveCount(0);
  // Live research can save the web sources it found, so check only the two added here.
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

test("lib-offline: offline, the switch does not move and says the change was not saved", async ({ signedIn: page, user, evidence }) => {
  await startDebate(page, motion);
  await page.goto("/app/library");
  await addSource(page, "Offline study", "Fares and ridership.");
  await expect(page.getByText("Saved Offline study to the Library")).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("switch", { name: "Toggle Offline study" }).click();
  await expect(page.getByText("You are offline. Reconnect and try again.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Offline study" })).toBeChecked();
  await evidence.shot("01-offline-toggle");
  await page.context().setOffline(false);
  const { data } = await admin.from("sources").select("is_active").eq("user_id", await user.userId()).eq("title", "Offline study");
  expect(data).toEqual([{ is_active: true }]);
  await evidence.json("02-row-unchanged", data);
});

test("lib-dedupe and lib-layout: a page saved once per debate, and long titles keep their room on a phone", async ({ signedIn: page, user, evidence }) => {
  await startDebate(page, motion);
  const userId = await user.userId();
  const { data: debateRow } = await admin.from("debates").select("id").eq("user_id", userId).eq("motion", motion).single();
  const title = "Por qué deberían prohibirse los deberes escolares en la educación primaria según los expertos";
  const url = "https://www.example.org/estudios/deberes-escolares-primaria/";
  await admin.from("sources").insert({ user_id: userId, debate_id: debateRow!.id, title, content: "Texto", type: "url", origin: url, folder: "General", is_active: true });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app/library");
  const titleButton = page.getByRole("button", { name: title, exact: true });
  await expect(titleButton).toBeVisible();
  // Before, the controls shared the title's line and left it a few letters.
  expect((await titleButton.boundingBox())!.width).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await evidence.shot("01-phone-row");

  // The same page with tracking and a fragment is refused before any fetch.
  let imported = false;
  page.on("request", (request) => { if (request.url().includes("/functions/v1/import-source")) imported = true; });
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Import from URL" }).fill("http://example.org/estudios/deberes-escolares-primaria?utm_source=x#top");
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByText("This page is already in this debate's Library.")).toBeVisible();
  expect(imported).toBe(false);
  await evidence.shot("02-duplicate-warning");
  const { data } = await admin.from("sources").select("id").eq("user_id", userId);
  expect(data).toHaveLength(1);
});

test("lib-counts: the debate summary and Ask agree on how many sources a request uses", async ({ signedIn: page, user, evidence }) => {
  await startDebate(page, motion);
  const userId = await user.userId();
  const { data: debateRow } = await admin.from("debates").select("id").eq("user_id", userId).eq("motion", motion).single();
  // What Attack's research leaves behind: several pages switched on, some off.
  await admin.from("sources").insert([1, 2, 3, 4, 5, 6, 7].map((n) => ({
    user_id: userId, debate_id: debateRow!.id, title: `Researched page ${n}`, content: `Finding ${n}`, type: "url",
    origin: `https://example.org/page-${n}`, folder: "Auto-saved", is_active: n <= 5,
  })));
  await page.goto("/app");
  await expect(page.getByTestId("home-current-debate")).toContainText("7 sources (5 active)");
  await evidence.shot("01-home-counts");
  await page.goto("/app/ask");
  await expect(page.getByTestId("debate-context-control")).toContainText("Using 5 sources");
  await evidence.shot("02-ask-counts");
});
