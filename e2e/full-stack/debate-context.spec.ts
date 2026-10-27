import type { Page } from "@playwright/test";
import { admin, expect, expectResult, fake, MARK, stackReady, startDebate, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

// EVIDENCE_DIR=<dir> records video and key screenshots for review.
const evidenceDir = process.env.EVIDENCE_DIR;
test.use({ video: evidenceDir ? "on" : "retain-on-failure" });

const MOTION = "This House would make public transport free";
const INSTRUCTION = "DEBATE-INSTRUCTION: define free as zero fare at the point of use.";

async function snap(page: Page, name: string) {
  if (!evidenceDir) return;
  await page.screenshot({ path: `${evidenceDir}/${test.info().project.name}-${name}.png`, fullPage: true });
}

async function addSource(page: Page, title: string, content: string) {
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Content", exact: true }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

async function latestCall(feature: string, after = 0) {
  let call: Awaited<ReturnType<typeof fake.requests>>[number] | undefined;
  await expect.poll(async () => {
    const calls = (await fake.requests()).filter((request) => request.feature === feature);
    call = calls.length > after ? calls.at(-1) : undefined;
    return Boolean(call);
  }).toBe(true);
  return call!;
}

test("every request carries its debate's material, and Review changes exactly one request", async ({ signedIn: page, user }) => {
  test.setTimeout(150_000);
  const userId = await user.userId();

  await startDebate(page, MOTION);
  await addSource(page, "Fare study", "FARE-SOURCE fare collection costs a fifth of farebox revenue.");
  await addSource(page, "Ridership study", "RIDERSHIP-SOURCE ridership rose after fares were removed.");
  const { error: instructionError } = await admin.from("debates").update({ instructions: INSTRUCTION }).eq("user_id", userId);
  expect(instructionError).toBeNull();

  // Generate reads the motion, instructions, and both active sources, and saves a case.
  await page.goto("/app/generate");
  const control = page.getByTestId("debate-context-control");
  await expect(control).toContainText("Using 2 sources");
  await snap(page, "1-generate-context-line");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  await expectResult(page, `${MARK} case thesis`);
  const generateCall = await latestCall("generate");
  for (const expected of ["<current-debate>", MOTION, INSTRUCTION, "FARE-SOURCE", "RIDERSHIP-SOURCE", "STUDENT MATERIAL RULES"]) {
    expect(generateCall.system).toContain(expected);
  }

  // Brainstorm offers the saved case by default. Review drops one source and pins the case.
  await page.goto("/app/brainstorm");
  await expect(control).toContainText("Using 2 sources and 1 saved result");
  await control.getByRole("button", { name: "Review" }).click();
  const sheet = page.getByRole("dialog", { name: "What this request will use" });
  await sheet.getByRole("checkbox", { name: /Ridership study/ }).click();
  await sheet.getByRole("button", { name: /^Pin / }).click();
  await expect(sheet.getByRole("button", { name: /^Unpin / })).toHaveAttribute("aria-pressed", "true");
  await snap(page, "2-review-sheet");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(control).toContainText("Using 1 source and 1 saved result");

  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await expectResult(page, `${MARK} idea 1`);
  const brainstormCall = await latestCall("brainstorm");
  expect(brainstormCall.system).toContain("FARE-SOURCE");
  expect(brainstormCall.system).not.toContain("RIDERSHIP-SOURCE");
  expect(brainstormCall.system).toContain(`${MARK} case thesis`);

  // The choice covered one request: the next one starts from the defaults
  // again, which now include the brainstorm that request just saved.
  await expect(control).toContainText("Using 2 sources and 2 saved results: Brainstorm, Case (In favor)");
  await control.getByRole("button", { name: "Review" }).click();
  await expect(sheet).toContainText("1 source and 1 saved result reached the model.");
  await snap(page, "3-review-after-request");
  await page.keyboard.press("Escape");

  // The pin is stored for this debate only.
  const { data: pins } = await admin.from("debate_context_pins").select("item_kind").eq("user_id", userId);
  expect(pins).toEqual([{ item_kind: "case" }]);

  // Crossfire keeps free-form instructions out, and one-off mode sends nothing.
  await page.goto("/app/crossfire");
  await page.getByTestId("debate-context-control").getByRole("button", { name: "Review" }).click();
  await expect(sheet).toContainText("Free-form instructions are not used here");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / topic *").fill("This House would lower the voting age");
  const before = (await fake.requests()).filter((request) => request.feature === "brainstorm").length;
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Use once without saving to a debate" }).click();
  await expectResult(page, `${MARK} idea 1`);
  const oneOffCall = await latestCall("brainstorm", before);
  expect(oneOffCall.system).not.toContain("<current-debate>");
  expect(oneOffCall.system).not.toContain("FARE-SOURCE");
  // A single "use once" run leaves the Current Debate in place; one-off mode says so above the button.
  await expect(control).toContainText("Using 2 sources and 2 saved results");
  await page.getByTestId("current-debate-strip").getByRole("button", { name: "Use once" }).click();
  await expect(control).toContainText("One-off mode: no Current Debate material will be used or saved.");
  await snap(page, "4-one-off-line");
});
