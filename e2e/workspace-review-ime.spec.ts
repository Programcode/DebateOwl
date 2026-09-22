import { expect, test, type CDPSession, type Page } from "@playwright/test";

interface ImeSnapshot {
  canonical: string;
  canonicalUpdates: number;
  suggestion: string;
  editorComposing: boolean;
  phase: "idle" | "composing" | "settled";
  events: Array<{
    type: string;
    data: string | null;
    inputType: string | null;
    isComposing: boolean | null;
  }>;
  proposal: null | {
    status: string;
    replacement: Array<{ type: string; text?: string }>;
  };
}

interface WorkspaceImeHarness {
  snapshot(): ImeSnapshot;
  capture(id: string): ImeSnapshot;
  accept(): ImeSnapshot;
  reject(): ImeSnapshot;
  resetSuggestion(): ImeSnapshot;
}

declare global {
  interface Window {
    workspaceIme: WorkspaceImeHarness;
  }
}

async function snapshot(page: Page) {
  return page.evaluate(() => window.workspaceIme.snapshot());
}

async function compose(
  page: Page,
  cdp: CDPSession,
  id: string,
  steps: [string, ...string[]],
  accepted: string,
  acceptedUpdates: number,
) {
  await page.locator(".ProseMirror").focus();
  await page.locator(".ProseMirror").press("End");
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    const during = await page.evaluate((proposalId) =>
      window.workspaceIme.capture(proposalId), id,
    );
    expect(during.phase).toBe("composing");
    expect(during.proposal).toBeNull();
    expect(during.canonical).toBe(accepted);
    expect(during.canonicalUpdates).toBe(acceptedUpdates);
  }
  await cdp.send("Input.insertText", { text: steps[steps.length - 1] });
  await expect.poll(async () => (await snapshot(page)).phase).toBe("settled");
  await expect.poll(async () => (await snapshot(page)).proposal).not.toBeNull();
}

test("captures Spanish and Hungarian IME text only after composition settles", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Chromium CDP provides native IME composition");

  await page.goto("/e2e/fixtures/workspace-review-ime.html");
  await expect.poll(() => page.evaluate(() => Boolean(window.workspaceIme))).toBe(true);
  const cdp = await context.newCDPSession(page);

  await compose(page, cdp, "spanish", ["n", "ni", "niñ", "niño"], "Accepted:", 0);
  const spanishSettled = await page.evaluate(() => window.workspaceIme.capture("spanish"));
  expect(spanishSettled.events.map((event) => event.type)).toEqual(expect.arrayContaining([
    "compositionstart",
    "beforeinput",
    "input",
  ]));
  const compositionInputs = spanishSettled.events.filter((event) =>
    event.type === "beforeinput" && event.inputType === "insertCompositionText",
  );
  expect(compositionInputs.length).toBeGreaterThan(0);
  expect(compositionInputs.every((event) => event.isComposing)).toBe(true);
  expect(spanishSettled.proposal).toEqual({
    status: "pending",
    replacement: [{ type: "text", text: "niño" }],
  });
  expect(spanishSettled.canonical).toBe("Accepted:");
  expect(spanishSettled.canonicalUpdates).toBe(0);
  expect((await page.evaluate(() => window.workspaceIme.accept())).canonical).toBe("Accepted:niño");

  await page.evaluate(() => window.workspaceIme.resetSuggestion());
  await compose(
    page,
    cdp,
    "hungarian",
    ["t", "tű", "tűr", "tűrő"],
    "Accepted:niño",
    1,
  );
  const hungarianSettled = await page.evaluate(() => window.workspaceIme.capture("hungarian"));
  expect(hungarianSettled.proposal).toEqual({
    status: "pending",
    replacement: [{ type: "text", text: "tűrő" }],
  });
  expect(hungarianSettled.canonical).toBe("Accepted:niño");
  const rejected = await page.evaluate(() => window.workspaceIme.reject());
  expect(rejected.proposal?.status).toBe("rejected");
  expect(rejected.canonical).toBe("Accepted:niño");
});
