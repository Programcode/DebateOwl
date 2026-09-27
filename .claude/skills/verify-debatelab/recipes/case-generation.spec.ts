import { readFile } from "node:fs/promises";
import { admin, AI_TIMEOUT, aiResponse, expect, expectProviderCalls, fake, LIVE, signIn, test } from "./fixtures";

// Feature map: features/case-generation.md.
const motion = "This House would make public transport free at the point of use";

type CaseOutput = { caseStructure: { thesis: string }; contentions: Array<{ claim: string }> };

async function generate(page: import("@playwright/test").Page) {
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Ready to Generate" })).toBeVisible();
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  const body = await response;
  const output = body.output as unknown as CaseOutput;
  // Standard length asks for exactly three contentions.
  expect(output.contentions).toHaveLength(3);
  await expect(page.getByText(output.caseStructure.thesis).first()).toBeVisible();
  return { body, output };
}

test("gen-create and gen-save: generate a case, save it, and reopen it from History on a fresh device", async ({ signedIn: page, user, evidence, browser }) => {
  await evidence.step(`Generate: motion "${motion}"`);
  const { body, output } = await generate(page);
  await evidence.json("01-generate-response", body);
  await evidence.shot("01-generated");
  await evidence.aria("01-generated");
  for (const contention of output.contentions) await expect(page.getByText(contention.claim).first()).toBeVisible();

  const call = (await expectProviderCalls(["generate"])).find((item) => item.feature === "generate")!;
  expect(call.user).toContain(`Motion: ${motion}`);
  const userId = await user.userId();
  const { data: usage } = await admin.from("ai_requests").select("feature,status,model").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success" }));
  await evidence.json("02-ai-requests", usage);

  const title = `Verify case ${Date.now()}`;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Case title").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await evidence.step(`Saved the case as "${title}"`);
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("title").eq("user_id", userId);
    return data?.map((row) => row.title);
  }).toEqual([title]);

  // A fresh browser context has no local copy, so History must hydrate from the database.
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(other, user);
    await other.goto("/app/history");
    await expect(other.getByText(title).first()).toBeVisible();
    await evidence.shot("03-history-fresh-device", other);
    await other.getByRole("button", { name: "Load" }).first().click();
    await expect(other.getByText(output.caseStructure.thesis).first()).toBeVisible();
    await evidence.shot("04-reopened-from-history", other);
    await evidence.step("Reopened the case from History on a fresh device");
  } finally {
    await context.close();
  }
});

test("gen-research: generation researches the web and cites what it found", async ({ signedIn: page, evidence }) => {
  const { body } = await generate(page);
  await evidence.json("01-generate-response", body);
  const sources = (body.discoveredSources ?? []) as Array<{ url: string }>;
  await evidence.json("02-discovered-sources", sources);
  if (!LIVE) {
    // The fake stack has no Exa key, so research finds nothing. Record it; do not claim it.
    test.info().annotations.push({ type: "unverified", description: "web research needs --live (Exa)" });
    return;
  }
  expect(sources.length, "web sources found by research").toBeGreaterThan(0);
  expect(sources.every((source) => /^https?:\/\//.test(source.url))).toBe(true);
  const panel = page.getByText("Researched sources").locator("..");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link").first()).toHaveAttribute("href", /^https?:\/\//);
  await evidence.shot("03-researched-sources");
});

test("gen-export: a generated case exports to PDF and DOCX", async ({ signedIn: page, evidence }) => {
  await generate(page);
  for (const [button, extension, magic] of [["PDF", ".pdf", "%PDF"], ["DOCX", ".docx", "PK"]] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`));
    const path = `${evidence.dir}/export${extension}`;
    await file.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.subarray(0, magic.length).toString("latin1"), `${button} file signature`).toBe(magic);
    await evidence.step(`Exported ${button}: ${file.suggestedFilename()} (${bytes.length} bytes, saved as export${extension})`);
  }
});

test("gen-error: a provider failure shows an error and the retry succeeds", async ({ signedIn: page, evidence }) => {
  await fake.fail("generate", 500);
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByText("Generation Failed", { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-failed");
  await expect(page.getByRole("button", { name: "Generate Debate Case" })).toBeEnabled();

  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  const body = await response;
  await expect(page.getByText((body.output as unknown as CaseOutput).caseStructure.thesis).first()).toBeVisible();
  await evidence.shot("02-retried");
});

test("gen-quota: an account without quota is told why and the provider is never called", async ({ signedIn: page, user, evidence }) => {
  await admin.from("user_settings").update({ daily_limit_override: 0 }).eq("user_id", await user.userId());
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByRole("dialog").getByText("Daily Access Paused")).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-quota-dialog");
  expect((await fake.requests()).filter((request) => request.feature === "generate")).toEqual([]);
});
