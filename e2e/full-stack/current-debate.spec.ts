import type { Page } from "@playwright/test";
import { admin, chooseForMotion, debateControl, expect, expectResult, fake, MARK, stackReady, startDebate, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

// EVIDENCE_DIR=<dir> records video and key screenshots for review.
const evidenceDir = process.env.EVIDENCE_DIR;
test.use({ video: evidenceDir ? "on" : "retain-on-failure" });

const HOMEWORK = "This House would ban homework";
const ZOOS = "This House would abolish zoos";

async function snap(page: Page, name: string) {
  if (!evidenceDir) return;
  await page.screenshot({ path: `${evidenceDir}/${test.info().project.name}-${name}.png`, fullPage: true });
}

async function addSource(page: Page, title: string, content: string) {
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Content", exact: true }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

async function switchDebate(page: Page, motion: string) {
  await debateControl(page).click();
  await page.getByRole("dialog").getByRole("button", { name: "Switch debate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: `Switch to ${motion}` }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(debateControl(page)).toHaveAttribute("aria-label", `Current debate: ${motion}`);
}

async function latestCall(feature: string) {
  let call: Awaited<ReturnType<typeof fake.requests>>[number] | undefined;
  await expect.poll(async () => {
    call = (await fake.requests()).filter((request) => request.feature === feature).at(-1);
    return Boolean(call);
  }).toBe(true);
  return call!;
}

test("two debates keep their motions, sources, and results apart", async ({ signedIn: page, user }) => {
  test.setTimeout(120_000);
  const userId = await user.userId();

  // First debate: its source grounds a Brainstorm that fills in the motion by itself.
  await expect(page.getByTestId("home-current-debate")).toContainText("No current debate");
  await startDebate(page, HOMEWORK);
  await addSource(page, "Homework study", "HOMEWORK-SOURCE pupils sleep less when homework runs late.");

  await page.goto("/app/brainstorm");
  await expect(page.getByTestId("current-debate-strip")).toContainText(`Working in: ${HOMEWORK}`);
  await expect(page.getByLabel("Motion / Topic *")).toHaveValue(HOMEWORK);
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await expectResult(page, `${MARK} idea 1`);
  const homeworkCall = await latestCall("brainstorm");
  expect(homeworkCall.user).toContain(`Motion: ${HOMEWORK}`);
  expect(homeworkCall.system).toContain("HOMEWORK-SOURCE");
  await snap(page, "1-brainstorm-in-homework-debate");

  // Second debate: a fresh Library and a case grounded only in its own source.
  await startDebate(page, ZOOS);
  await page.goto("/app/library");
  await expect(page.getByTestId("library-debate")).toContainText(ZOOS);
  await expect(page.getByRole("switch", { name: "Toggle Homework study" })).toHaveCount(0);
  await addSource(page, "Zoo study", "ZOO-SOURCE conservation breeding saved several species.");
  await snap(page, "2-library-in-zoo-debate");

  await page.goto("/app/generate");
  await expect(page.getByRole("textbox", { name: "Motion / Topic *" })).toHaveValue(ZOOS);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expectResult(page, `${MARK} case thesis`);
  const zooCall = await latestCall("generate");
  expect(zooCall.user).toContain(`Motion: ${ZOOS}`);
  expect(zooCall.system).toContain("ZOO-SOURCE");
  expect(zooCall.system).not.toContain("HOMEWORK-SOURCE");

  // A different motion asks first; "use once" keeps it out of every debate.
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("This House would lower the voting age");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  await expect(page.getByRole("dialog")).toContainText("This is a different motion");
  await snap(page, "3-different-motion-choice");
  await chooseForMotion(page, "once");
  await expectResult(page, `${MARK} idea 1`);
  const oneOffCall = await latestCall("brainstorm");
  expect(oneOffCall.system).not.toContain("ZOO-SOURCE");
  expect(oneOffCall.system).not.toContain("HOMEWORK-SOURCE");

  // The dashboard shows only this debate's work, with both sides as equals.
  await page.goto("/app/debate");
  await expect(page.getByTestId("current-debate-motion")).toHaveText(ZOOS);
  await expect(page.getByTestId("debate-side-pro")).toContainText("In favor");
  await expect(page.getByTestId("debate-side-con")).toContainText("Against");
  await expect(page.getByTestId("debate-sources")).toContainText("Zoo study");
  await expect(page.getByTestId("debate-sources")).not.toContainText("Homework study");
  await expect(page.getByTestId("debate-recent")).toContainText(ZOOS);
  await snap(page, "4-zoo-dashboard");

  // Switching back switches the Library and History with it.
  await switchDebate(page, HOMEWORK);
  await page.goto("/app/library");
  await expect(page.getByRole("switch", { name: "Toggle Homework study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Zoo study" })).toHaveCount(0);
  await page.goto("/app/history");
  await page.getByRole("tab", { name: /Brainstorms/ }).click();
  await expect(page.getByRole("tabpanel").getByText(HOMEWORK)).toBeVisible();
  await page.getByRole("tab", { name: /Cases/ }).click();
  await expect(page.getByRole("tabpanel").getByText("No saved cases yet")).toBeVisible();
  await snap(page, "5-history-back-in-homework");

  // The database agrees: every row sits in exactly the debate it came from.
  const { data: debates } = await admin.from("debates").select("id,motion").eq("user_id", userId);
  const idFor = (motion: string) => debates!.find((debate) => debate.motion === motion)!.id;
  const { data: sources } = await admin.from("sources").select("title,debate_id").eq("user_id", userId).order("title");
  expect(sources).toEqual([
    { title: "Homework study", debate_id: idFor(HOMEWORK) },
    { title: "Zoo study", debate_id: idFor(ZOOS) },
  ]);
  const { data: cases } = await admin.from("cases").select("debate_id,side").eq("user_id", userId);
  expect(cases).toEqual([{ debate_id: idFor(ZOOS), side: "pro" }]);
  const { data: brainstorms } = await admin.from("brainstorms").select("debate_id").eq("user_id", userId);
  expect(brainstorms).toEqual([{ debate_id: idFor(HOMEWORK) }]);
  const { data: current } = await admin.from("current_debates").select("debate_id").eq("user_id", userId).single();
  expect(current?.debate_id).toBe(idFor(HOMEWORK));
});
