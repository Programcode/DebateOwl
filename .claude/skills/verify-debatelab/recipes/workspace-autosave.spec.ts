import type { Page, Request, Route } from "@playwright/test";
import { admin, AI_TIMEOUT, expect, test } from "./fixtures";

// Crossfire and Sparring launched from a workspace save their state to
// workspace_artifacts on every change. A slow save must not land after a newer
// one and leave older text in the row (fixed in #89). Each recipe holds one
// save in flight while typing continues, then checks the row has the newest text.
// Workspaces need the collaboration service, which only `verify.sh up --collab` starts.
test.skip(process.env.VERIFY_COLLAB !== "true", "Workspaces need the collaboration service: run verify.sh up --collab");

const motion = "This House would require coding classes in every secondary school.";

type SaveBody = { p_progress: Record<string, unknown> };

async function openWorkspaceTool(page: Page, tool: "Crossfire" | "Sparring") {
  await page.goto("/app/workspaces");
  await page.getByRole("textbox", { name: "Motion" }).fill(motion);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/, { timeout: 20_000 });
  const workspaceId = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "R1" }).click();
  // On a phone the workspace shows one pane at a time.
  const workingPanel = page.getByRole("button", { name: "Working panel", exact: true });
  if (await workingPanel.isVisible()) await workingPanel.click();
  const practice = page.locator("summary").filter({ hasText: "Practice" });
  if (!await practice.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) await practice.click();
  await page.getByRole("button", { name: tool, exact: true }).click();
  await expect(page.getByText(/Shared workspace session/)).toBeVisible();
  return workspaceId;
}

/**
 * Holds the first save whose progress matches `slow` until `release()`. The page
 * sends one save at a time, so `sentWhileHeld()` must stay empty; if it does not,
 * the held save would reach the database after newer ones and store older text.
 */
async function holdSave(page: Page, slow: (progress: Record<string, unknown>) => boolean) {
  let held: Request | undefined;
  let holding = false;
  const sent: Request[] = [];
  const whileHeld: Request[] = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/rest/v1/rpc/save_workspace_artifact", async (route: Route) => {
    const request = route.request();
    sent.push(request);
    const body = request.postDataJSON() as SaveBody;
    if (!held && slow(body.p_progress)) {
      held = request;
      holding = true;
      await released;
    } else if (holding) {
      whileHeld.push(request);
    }
    await route.continue();
  });
  return {
    wasHeld: () => Boolean(held),
    sentWhileHeld: () => whileHeld.length,
    /** Lets the held save through and waits for its answer. */
    release: async () => {
      release();
      await held!.response();
      holding = false;
    },
    /** Waits until every save the page has sent so far has an answer. */
    settled: () => Promise.all(sent.map((request) => request.response())),
  };
}

async function storedProgress(workspaceId: string, tool: string) {
  const { data, error } = await admin.from("workspace_artifacts").select("progress,request_id").eq("workspace_id", workspaceId).eq("tool", tool);
  if (error) throw error;
  return data;
}

test("ws-crossfire-autosave: a slow Crossfire save does not overwrite newer text", async ({ signedIn: page, evidence }) => {
  const workspaceId = await openWorkspaceTool(page, "Crossfire");
  const resolution = page.getByTestId("crossfire-resolution");
  await expect(resolution).toHaveValue(motion);

  const saves = await holdSave(page, (progress) => String((progress.config as { resolution?: string })?.resolution).endsWith(" n"));
  await resolution.focus();
  await resolution.press("Control+End");
  await resolution.pressSequentially(" now, starting next year", { delay: 40 });
  const expected = `${motion} now, starting next year`;
  await expect(resolution).toHaveValue(expected);
  expect(saves.wasHeld()).toBe(true);
  expect(saves.sentWhileHeld()).toBe(0);
  await saves.release();
  await evidence.step("Crossfire: held one save in flight while the resolution kept changing");

  const resolutions = async () => (await storedProgress(workspaceId, "crossfire"))
    .map((row) => (row.progress as { config: { resolution: string } }).config.resolution);
  await expect.poll(resolutions, { timeout: 15_000 }).toEqual([expected]);
  await saves.settled();
  expect(await resolutions()).toEqual([expected]);
  await evidence.shot("ws-crossfire-autosave");
});

test("ws-sparring-autosave: a slow Sparring save does not overwrite a newer draft", async ({ signedIn: page, evidence }) => {
  const workspaceId = await openWorkspaceTool(page, "Sparring");
  await expect(page.getByLabel("Motion")).toHaveValue(motion);
  await page.getByRole("button", { name: "Start round" }).click();
  const draft = page.getByRole("textbox", { name: /^Draft for / });
  await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
  // A running clock saves the session every tick, which would hide a stale save.
  const pause = page.getByRole("button", { name: "Pause clock" });
  if (await pause.isVisible()) await pause.click();
  await expect(page.getByRole("button", { name: "Resume clock" })).toBeVisible();

  const saves = await holdSave(page, (progress) => progress.draft === "Coding");
  const text = "Coding classes teach every student to break problems into steps.";
  await draft.pressSequentially(text, { delay: 40 });
  await expect(draft).toHaveValue(text);
  expect(saves.wasHeld()).toBe(true);
  expect(saves.sentWhileHeld()).toBe(0);
  await saves.release();
  await evidence.step("Sparring: held one save in flight while the speech draft kept changing");

  const drafts = async () => (await storedProgress(workspaceId, "sparring")).map((row) => (row.progress as { draft: string }).draft);
  await expect.poll(drafts, { timeout: 15_000 }).toEqual([text]);
  await saves.settled();
  expect(await drafts()).toEqual([text]);
  await evidence.shot("ws-sparring-autosave");
});
