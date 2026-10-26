import type { Page, Response } from "@playwright/test";
import { AI_TIMEOUT, expect, expectStreamed, fake, readAIResponse, startDebate, test } from "./fixtures";

// Feature map: features/live-generation.md.
const motion = "This House would make public transport free at the point of use";

/** The next `ai` request for a feature, with the body the page sent. */
function aiRequest(page: Page, feature: string): Promise<Response> {
  return page.waitForResponse((response) => {
    if (!response.url().endsWith("/functions/v1/ai") || response.request().method() !== "POST") return false;
    try {
      return (response.request().postDataJSON() as { feature?: string }).feature === feature;
    } catch {
      return false;
    }
  }, { timeout: AI_TIMEOUT });
}

/** The event stream's shape: token deltas in order, then exactly one result. */
async function expectLiveStream(response: Response) {
  expect((response.request().postDataJSON() as { stream?: unknown }).stream, "the page asked for live generation").toBe(true);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
  const text = await response.text();
  const events = text.split("\n\n").flatMap((block) => /^event: (\w+)$/m.exec(block)?.[1] ?? []);
  const deltas = events.filter((event) => event === "delta").length;
  expect(deltas, "token deltas").toBeGreaterThan(3);
  expect(events.filter((event) => event === "result"), "one result event").toHaveLength(1);
  expect(events.at(-1)).toBe("result");
  const { status, body } = await readAIResponse(response);
  expect(status).toBe(200);
  return { deltas, body };
}

test("live-generate: a case fills in section by section while the model writes it", async ({ signedIn: page, evidence }) => {
  // Fake mode writes a case in about a second; slow it so the draft can be inspected.
  await fake.streamDelay(80);
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await expect(page.getByRole("textbox", { name: "Motion / Topic *" })).toHaveValue(motion);
  const request = aiRequest(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();

  // Before the answer is complete, the draft shows what is written so far.
  const draft = page.getByTestId("live-draft");
  await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(draft.getByRole("region", { name: "Case Structure" })).toBeVisible();
  await expect(draft.getByTestId("live-caret")).toHaveCount(1);
  await expect(draft.getByRole("button", { name: "Cancel" })).toBeVisible();
  await evidence.shot("01-writing-live");
  await evidence.aria("01-writing-live", draft);

  const { deltas, body } = await expectLiveStream(await request);
  await evidence.step(`Generate streamed ${deltas} token deltas before its result`);
  const thesis = (body.output as { caseStructure: { thesis: string } }).caseStructure.thesis;
  // The finished case replaces the draft with the full result and its toolbar.
  await expect(draft).toHaveCount(0);
  await expect(page.getByText(thesis).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await evidence.shot("02-finished-case");
  await expectStreamed(["generate"]);
});

test("live-cancel: Cancel stops a live run and leaves no draft or result", async ({ signedIn: page, evidence }) => {
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const draft = page.getByTestId("live-draft");
  await expect(draft).toBeVisible({ timeout: AI_TIMEOUT });
  await draft.getByRole("button", { name: "Cancel" }).click();
  await expect(draft).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ready to Generate" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await evidence.shot("01-canceled");
});

test("live-tools: Attack, Brainstorm, Factoids, and cited Ask stream their answers", async ({ signedIn: page, evidence }) => {
  await startDebate(page, motion);

  await page.goto("/app/attack");
  await page.getByLabel("Your Argument *").fill("Free transit raises ridership, so it always pays for itself.");
  let request = aiRequest(page, "attack");
  await page.getByRole("button", { name: "Find weaknesses" }).click();
  await expectLiveStream(await request);
  await evidence.shot("01-attack");

  await page.goto("/app/brainstorm");
  request = aiRequest(page, "brainstorm");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
  await expectLiveStream(await request);
  await evidence.shot("02-brainstorm");

  await page.goto("/app/factoids");
  await page.getByLabel("Statement *").fill("Free fares increase public transport ridership.");
  request = aiRequest(page, "factoids");
  await page.getByRole("button", { name: "Find Factoids" }).click();
  await expectLiveStream(await request);
  await evidence.shot("03-factoids");

  await page.goto("/app/ask");
  await page.getByRole("button", { name: "Options" }).click();
  await page.locator("#citation-mode").click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Ask your debate coach...").fill("How should I weigh access against cost?");
  request = aiRequest(page, "ask");
  await page.getByRole("button", { name: "Send message" }).click();
  const { body } = await expectLiveStream(await request);
  const answer = (body.output as { response: string }).response;
  await expect(page.getByText(answer.slice(0, 30)).first()).toBeVisible();
  await evidence.shot("04-ask-cited");

  await expectStreamed(["attack", "brainstorm", "factoids", "ask"]);
});
