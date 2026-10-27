import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, debateControl, expect, LIVE, type ProviderCall, providerCalls, signIn, startDebate, test } from "./fixtures";

// Feature map: features/current-debate.md. Mirrors e2e/full-stack/current-debate.spec.ts
// and e2e/full-stack/first-run.spec.ts with structural assertions, so it
// passes in both modes. Markers in source text prove which sources reached
// the prompt; model wording is never asserted.

const HOMEWORK = "This House would ban homework";
const ZOOS = "This House would abolish zoos";
// Several AI round trips per test; live reasoning models are slow.
const LIVE_AWARE_TIMEOUT = LIVE ? 900_000 : 150_000;

async function addSource(page: Page, title: string, content: string) {
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add source" }).click();
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

/** The newest provider call for a feature, once more than `after` of them exist. */
async function latestCall(feature: string, after: number) {
  let call: ProviderCall | undefined;
  await expect.poll(async () => {
    const calls = (await providerCalls()).filter((item) => item.feature === feature);
    call = calls.length > after ? calls.at(-1) : undefined;
    return Boolean(call);
  }, { timeout: AI_TIMEOUT }).toBe(true);
  return call!;
}

async function callCount(feature: string) {
  return (await providerCalls()).filter((item) => item.feature === feature).length;
}

test("debate-start, debate-scope, debate-once, debate-switch: two debates keep their motions, sources, and results apart", async ({ signedIn: page, user, evidence }) => {
  test.setTimeout(LIVE_AWARE_TIMEOUT);
  const userId = await user.userId();

  // First debate, started from the header. Its source grounds a Brainstorm that prefills the motion.
  await expect(page.getByTestId("home-current-debate")).toContainText("No current debate");
  await startDebate(page, HOMEWORK);
  await evidence.step(`Header → Start debate: "${HOMEWORK}"`);
  await evidence.aria("01-header-after-start", debateControl(page));
  await addSource(page, "Homework study", "HOMEWORK-SOURCE pupils sleep less when homework runs late.");

  await page.goto("/app/brainstorm");
  await expect(page.getByTestId("current-debate-strip")).toContainText(`Working in: ${HOMEWORK}`);
  await expect(page.getByLabel("Motion / Topic *")).toHaveValue(HOMEWORK);
  let before = await callCount("brainstorm");
  const homeworkRun = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  const ideas = (await homeworkRun).output.topFive as Array<{ idea: { title: string } }>;
  await expect(page.getByText(ideas[0].idea.title).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The client files the result after it renders; a full reload any sooner loses it.
  await expect.poll(async () => (await admin.from("brainstorms").select("id").eq("user_id", userId)).data?.length).toBe(1);
  const homeworkCall = await latestCall("brainstorm", before);
  expect(homeworkCall.user).toContain(`Motion: ${HOMEWORK}`);
  expect(homeworkCall.system).toContain("HOMEWORK-SOURCE");
  await evidence.shot("02-brainstorm-in-homework-debate");

  // Second debate: a fresh Library and a case grounded only in its own source.
  await startDebate(page, ZOOS);
  await evidence.step(`Header → Start new debate: "${ZOOS}"`);
  await page.goto("/app/library");
  await expect(page.getByTestId("library-debate")).toContainText(ZOOS);
  await expect(page.getByRole("switch", { name: "Toggle Homework study" })).toHaveCount(0);
  await addSource(page, "Zoo study", "ZOO-SOURCE conservation breeding saved several species.");
  await evidence.shot("03-library-in-zoo-debate");

  await page.goto("/app/generate");
  await expect(page.getByRole("textbox", { name: "Motion / Topic *" })).toHaveValue(ZOOS);
  before = await callCount("generate");
  const zooRun = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const zooCase = (await zooRun).output as { caseStructure: { thesis: string } };
  await expect(page.getByText(zooCase.caseStructure.thesis).first()).toBeVisible();
  await expect.poll(async () => (await admin.from("cases").select("id").eq("user_id", userId)).data?.length).toBe(1);
  const zooCall = await latestCall("generate", before);
  expect(zooCall.user).toContain(`Motion: ${ZOOS}`);
  expect(zooCall.system).toContain("ZOO-SOURCE");
  expect(zooCall.system).not.toContain("HOMEWORK-SOURCE");

  // A different motion asks first; "use once" keeps it out of every debate.
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill("This House would lower the voting age");
  before = await callCount("brainstorm");
  const oneOffRun = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await expect(page.getByRole("dialog")).toContainText("This is a different motion");
  await evidence.shot("04-different-motion-choice");
  await evidence.aria("04-different-motion-choice", page.getByRole("dialog"));
  await chooseForMotion(page, "once");
  await evidence.step("Different motion on Brainstorm → Use once without saving to a debate");
  const oneOffIdeas = (await oneOffRun).output.topFive as Array<{ idea: { title: string } }>;
  await expect(page.getByText(oneOffIdeas[0].idea.title).first()).toBeVisible();
  const oneOffCall = await latestCall("brainstorm", before);
  expect(oneOffCall.system).not.toContain("ZOO-SOURCE");
  expect(oneOffCall.system).not.toContain("HOMEWORK-SOURCE");
  await expect(debateControl(page)).toHaveAttribute("aria-label", `Current debate: ${ZOOS}`);

  // The dashboard shows only this debate's work, with both sides as equals.
  await page.goto("/app/debate");
  await expect(page.getByTestId("current-debate-motion")).toHaveText(ZOOS);
  await expect(page.getByTestId("debate-side-pro")).toContainText("In favor");
  await expect(page.getByTestId("debate-side-con")).toContainText("Against");
  await expect(page.getByTestId("debate-sources")).toContainText("Zoo study");
  await expect(page.getByTestId("debate-sources")).not.toContainText("Homework study");
  await expect(page.getByTestId("debate-recent")).toContainText(ZOOS);
  await evidence.shot("05-zoo-dashboard");

  // Switching back switches the Library and History with it.
  await switchDebate(page, HOMEWORK);
  await evidence.step(`Header → Switch debate → Switch to "${HOMEWORK}"`);
  await page.goto("/app/library");
  await expect(page.getByRole("switch", { name: "Toggle Homework study" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Toggle Zoo study" })).toHaveCount(0);
  await page.goto("/app/history");
  await page.getByRole("tab", { name: /Brainstorms/ }).click();
  await expect(page.getByRole("tabpanel").getByText(HOMEWORK)).toBeVisible();
  await page.getByRole("tab", { name: /Cases/ }).click();
  await expect(page.getByRole("tabpanel").getByText("No saved cases yet")).toBeVisible();
  await evidence.shot("06-history-back-in-homework");

  // The database agrees: every row sits in exactly the debate it came from.
  // Live research may save web sources too, so only the two added here are checked.
  const { data: debates } = await admin.from("debates").select("id,motion").eq("user_id", userId);
  expect(debates?.map((debate) => debate.motion).sort()).toEqual([ZOOS, HOMEWORK].sort());
  const idFor = (motion: string) => debates!.find((debate) => debate.motion === motion)!.id;
  const { data: sources } = await admin.from("sources").select("title,debate_id").eq("user_id", userId).in("title", ["Homework study", "Zoo study"]).order("title");
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
  await evidence.json("07-rows", { debates, sources, cases, brainstorms, current });
});

test("debate-offer: with no Current Debate, a tool offers to start one for the motion it was given", async ({ signedIn: page, user, evidence }) => {
  const motion = "This House would abolish zoos";
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  const run = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();

  const offer = page.getByRole("dialog", { name: "Start a debate with this motion?" });
  await expect(offer).toContainText(motion);
  await evidence.shot("01-offer");
  await evidence.aria("01-offer", offer);
  await offer.getByRole("button", { name: "Start debate" }).click();
  await expect(offer).toBeHidden();
  await evidence.step("Generate with no Current Debate → Start a debate with this motion? → Start debate");

  const body = await run;
  const thesis = (body.output as { caseStructure: { thesis: string } }).caseStructure.thesis;
  await expect(page.getByText(thesis).first()).toBeVisible();
  await expect(page.getByTestId("current-debate-strip")).toContainText(`Working in: ${motion}`);
  await expect(debateControl(page)).toHaveAttribute("aria-label", `Current debate: ${motion}`);
  await evidence.shot("02-generated-in-new-debate");

  const userId = await user.userId();
  const { data: debates } = await admin.from("debates").select("id,motion").eq("user_id", userId);
  expect(debates?.map((debate) => debate.motion)).toEqual([motion]);
  const { data: current } = await admin.from("current_debates").select("debate_id").eq("user_id", userId).single();
  expect(current?.debate_id).toBe(debates![0].id);
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("debate_id").eq("user_id", userId);
    return data?.map((row) => row.debate_id);
  }).toEqual([debates![0].id]);
});

test("debate-tour: a brand-new account starts its first debate from the onboarding tour", async ({ page, user, evidence }) => {
  test.setTimeout(LIVE_AWARE_TIMEOUT);
  // The shared fixture marks the tour as seen. A new student has not seen it, so
  // override that once per browser session, as e2e/full-stack/first-run.spec.ts does.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("first-run-seeded")) return;
    sessionStorage.setItem("first-run-seeded", "1");
    localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: false, isTourRunning: false }, version: 0 }));
  });
  await signIn(page, user);

  const tooltip = page.locator(".react-joyride__tooltip");
  const next = page.locator('[data-test-id="button-primary"]');
  await expect(tooltip).toContainText("Welcome to DebateOwl!", { timeout: 15_000 });
  await expect(tooltip).toContainText("Start your first debate here.");
  await evidence.shot("01-tour-first-step");

  const motion = "This House would ban homework";
  await tooltip.getByRole("button", { name: "Start debate" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motion").fill(motion);
  await dialog.getByRole("button", { name: "Start debate" }).click();
  await expect(dialog).toBeHidden();
  await evidence.step(`Tour step 1 → Start debate: "${motion}"`);

  await expect(tooltip).toContainText("Library");
  await next.click();
  await expect(tooltip).toContainText("Generate");
  await next.click();
  await page.getByRole("button", { name: "Get started!" }).click();
  await expect(tooltip).toHaveCount(0);
  await evidence.step("Tour: Library → Generate → Get started!");

  const userId = await user.userId();
  const { data: debates } = await admin.from("debates").select("id,motion").eq("user_id", userId);
  expect(debates?.map((debate) => debate.motion)).toEqual([motion]);
  const { data: current } = await admin.from("current_debates").select("debate_id").eq("user_id", userId).single();
  expect(current?.debate_id).toBe(debates![0].id);

  // The first tool already works inside that debate, with no motion check.
  await page.locator('main [data-tour="mode-generate"]').click();
  await expect(page.getByTestId("current-debate-strip")).toContainText(`Working in: ${motion}`);
  await expect(page.getByRole("textbox", { name: "Motion / Topic *" })).toHaveValue(motion);
  const run = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  await run;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await evidence.shot("02-first-case-in-tour-debate");
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("debate_id").eq("user_id", userId);
    return data?.map((row) => row.debate_id);
  }).toEqual([debates![0].id]);
});
