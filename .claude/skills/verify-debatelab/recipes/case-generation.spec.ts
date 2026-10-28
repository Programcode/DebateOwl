import { readFile } from "node:fs/promises";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, type Evidence, expect, expectProviderCalls, fake, LIVE, providerCalls, signIn, startDebate, test } from "./fixtures";

// Feature map: features/case-generation.md.
const motion = "This House would make public transport free at the point of use";

type CaseOutput = { caseStructure: { thesis: string }; contentions: Array<{ claim: string }> };

/**
 * Starts a Current Debate for the motion from the header, as a student does
 * first. Generate then prefills that motion and runs with no motion check.
 */
async function openGenerate(page: import("@playwright/test").Page) {
  await startDebate(page, motion);
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Your case will appear here" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Motion / topic *" })).toHaveValue(motion);
}

async function generate(page: import("@playwright/test").Page) {
  await openGenerate(page);
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const body = await response;
  const output = body.output as unknown as CaseOutput;
  // Standard length asks for exactly three contentions.
  expect(output.contentions).toHaveLength(3);
  await expect(page.getByText(output.caseStructure.thesis).first()).toBeVisible();
  return { body, output };
}

/** Signs in on a fresh browser context, which has no local copy, so History must hydrate from the database. */
async function reopenFromHistory(browser: import("@playwright/test").Browser, user: Parameters<typeof signIn>[1], title: string, thesis: string, evidence: Evidence, prefix: string, scope: "debate" | "one-off") {
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(other, user);
    await other.goto("/app/history");
    // History shows the Current Debate's work in tabs, or, with no debate, a
    // list of one-off work. Scope to it: an auto-filed case is titled with the
    // motion, which the header also shows.
    let entry;
    if (scope === "debate") {
      entry = other.getByRole("tabpanel", { name: "Cases" });
      await expect(entry.getByRole("heading", { name: title })).toBeVisible();
    } else {
      await expect(other.getByRole("combobox", { name: "Show work from" })).toContainText("One-off and unsorted work");
      entry = other.getByRole("main").getByRole("listitem").filter({ hasText: title });
      await expect(entry).toBeVisible();
    }
    await evidence.shot(`${prefix}-history-fresh-device`, other);
    await entry.getByRole("button", { name: "Load" }).first().click();
    await expect(other.getByText(thesis).first()).toBeVisible();
    await evidence.shot(`${prefix}-reopened-from-history`, other);
    await evidence.step(`Reopened "${title}" from History on a fresh device`);
  } finally {
    await context.close();
  }
}

// Inside a Current Debate, Generate files the case in the debate by itself and
// shows no Save button; manual Save with a title is the one-off path (gen-save).
test("gen-create: a case generated in the Current Debate is filed there and reopens from History on a fresh device", async ({ signedIn: page, user, evidence, browser }) => {
  await evidence.step(`Header → Start debate, then Generate: motion "${motion}"`);
  const { body, output } = await generate(page);
  await evidence.json("01-generate-response", body);
  await evidence.shot("01-generated");
  await evidence.aria("01-generated");
  for (const contention of output.contentions) await expect(page.getByText(contention.claim).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  const call = (await expectProviderCalls(["generate"])).find((item) => item.feature === "generate")!;
  expect(call.user).toContain(`Motion: ${motion}`);
  const userId = await user.userId();
  const { data: usage } = await admin.from("ai_requests").select("feature,status,model").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success" }));
  await evidence.json("02-ai-requests", usage);

  // The case was recorded in the debate started for its motion, without a Save click.
  let title = "";
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("title,side,debates(motion)").eq("user_id", userId);
    title = (data?.[0]?.title as string | undefined) ?? "";
    return data?.map((row) => ({ side: row.side, debates: row.debates }));
  }).toEqual([{ side: "pro", debates: { motion } }]);
  expect(title.length).toBeGreaterThan(0);
  await evidence.json("03-case-row", { title, motion });

  await reopenFromHistory(browser, user, title, output.caseStructure.thesis, evidence, "04", "debate");
});

test("gen-save: a one-off case is saved under a title and reopens from History on a fresh device", async ({ signedIn: page, user, evidence, browser }) => {
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Your case will appear here" })).toBeVisible();
  await page.getByRole("textbox", { name: "Motion / topic *" }).fill(motion);
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  // No Current Debate: decline the offer, so the case belongs to no debate until saved.
  await chooseForMotion(page, "once");
  await evidence.step(`Generate: motion "${motion}", chose Not now, use it once`);
  const output = (await response).output as unknown as CaseOutput;
  await expect(page.getByText(output.caseStructure.thesis).first()).toBeVisible();
  await evidence.shot("01-generated-one-off");

  const title = `Verify case ${Date.now()}`;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Case title").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await evidence.step(`Saved the case as "${title}"`);
  const userId = await user.userId();
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("title,debate_id").eq("user_id", userId);
    return data;
  }).toEqual([{ title, debate_id: null }]);
  const { data: debates } = await admin.from("debates").select("id").eq("user_id", userId);
  expect(debates).toEqual([]);

  await reopenFromHistory(browser, user, title, output.caseStructure.thesis, evidence, "02", "one-off");
});

test("gen-flowchart: the Flowchart builds from the Current Debate's case, and its app text follows the language", async ({ signedIn: page, evidence }) => {
  const { output } = await generate(page);
  await page.goto("/app/flowchart");
  // The template stays the blank start; the case is one click away.
  await expect(page.getByText("Your Thesis", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Build from current case" }).click();
  await expect(page.getByText(output.caseStructure.thesis).first()).toBeVisible();
  for (const contention of output.contentions) await expect(page.getByText(contention.claim).first()).toBeVisible();
  await expect(page.getByText("Your Thesis", { exact: true })).toHaveCount(0);
  // Every node fits the canvas once it is built.
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector(".react-flow")!.getBoundingClientRect();
    return [...document.querySelectorAll(".react-flow__node")].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.left < canvas.left - 1 || box.right > canvas.right + 1 || box.top < canvas.top - 1 || box.bottom > canvas.bottom + 1;
    }).length;
  })).toBe(0);
  await expect(page.getByRole("button", { name: "From Thesis to Argument 1" })).toHaveCount(1);
  await evidence.shot("01-built-from-case");

  // Node titles the app wrote follow the language on the same canvas; the case's own text does not change.
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Interface language" }).getByRole("radio", { name: "Magyar" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("1. érv", { exact: true })).toBeVisible();
  await expect(page.getByText("Argument 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText(output.caseStructure.thesis).first()).toBeVisible();
  await evidence.shot("02-built-from-case-hu");
});

test("gen-roles: the speaker role shapes the case: Introductor, R2 and Conclusor", async ({ signedIn: page, evidence }) => {
  await openGenerate(page);
  const pickRole = async (name: string) => {
    await page.getByRole("combobox", { name: "Speaker Role" }).click();
    await page.getByRole("option", { name }).click();
  };
  const run = async (role: string) => {
    const response = aiResponse(page, "generate");
    await page.getByRole("button", { name: "Generate debate case" }).click();
    const body = await response;
    const call = (await providerCalls()).filter((item) => item.feature === "generate").at(-1);
    expect(call?.user).toContain(`Role: ${role}`);
    return body.output as unknown as CaseOutput & {
      opening?: { definition?: string };
      counters: unknown[];
      reinforce?: Array<{ argument: string; text: string }>;
      whyWeWin?: string[];
      closingLine?: string;
    };
  };

  await pickRole("Introductor (4 min)");
  const intro = await run("intro");
  await expect(page.getByText(intro.caseStructure.thesis).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate Opening" })).toBeVisible();
  if (intro.opening?.definition) await expect(page.getByText("What we mean:")).toBeVisible();
  if (!LIVE) expect(intro.opening?.definition).toBeTruthy();
  await evidence.shot("01-introductor");
  await evidence.aria("01-introductor");

  await pickRole("R2 - Rebuttal/Build (6 min)");
  const r2 = await run("r2");
  await expect(page.getByText(r2.caseStructure.thesis).first()).toBeVisible();
  // Only the Introductor defines a term.
  expect(r2.opening?.definition).toBeFalsy();
  await expect(page.getByText("What we mean:")).toHaveCount(0);
  // R2 brings no new arguments: it backs up the team's, then answers theirs.
  expect(r2.contentions).toEqual([]);
  expect(r2.reinforce?.length ?? 0).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Regenerate Arguments" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Regenerate Backing up our case" })).toBeVisible();
  for (const item of r2.reinforce ?? []) await expect(page.getByText(item.text).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate If they say…" })).toBeVisible();
  await expect(page.getByText("They say", { exact: true })).toHaveCount(r2.counters.length);
  // One full answer for each thing they are likely to say: standard length
  // asks for six, and the Edge Function keeps a live reply with at least four.
  if (LIVE) {
    expect(r2.counters.length).toBeGreaterThanOrEqual(4);
    expect(r2.counters.length).toBeLessThanOrEqual(6);
  } else {
    expect(r2.counters).toHaveLength(6);
  }
  await evidence.shot("02-r2");
  await evidence.aria("02-r2");

  await pickRole("Conclusor (3 min)");
  const conc = await run("conc");
  expect(conc.contentions).toEqual([]);
  expect(conc.whyWeWin?.length ?? 0).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Regenerate Why we win" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate Arguments" })).toHaveCount(0);
  for (const reason of conc.whyWeWin ?? []) await expect(page.getByText(reason).first()).toBeVisible();
  if (conc.closingLine) await expect(page.getByText(conc.closingLine).first()).toBeVisible();
  await evidence.shot("03-conclusor");
  await evidence.aria("03-conclusor");
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
  // The sources fold under the result header; open them as a student would.
  const panel = page.getByRole("group").filter({ hasText: /^Researched sources/ });
  await expect(panel).toBeVisible();
  await panel.getByText(/^Researched sources/).click();
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

test("gen-regenerate: regenerating one section keeps the rest of the case and its toolbar on screen", async ({ signedIn: page, evidence }) => {
  const { output } = await generate(page);
  const thesis = output.caseStructure.thesis;
  await evidence.shot("01-generated");

  // Hold the regenerate request so the in-flight screen can be checked.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/functions/v1/ai", async (route) => {
    await held;
    await route.continue();
  });
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Regenerate Arguments" }).click();
  await evidence.step("Clicked Regenerate Arguments; request held");

  const overlay = page.getByRole("status").filter({ hasText: "Regenerating Arguments" });
  await expect(overlay).toBeVisible();
  await expect(page.getByText(thesis).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate Opening" })).toBeDisabled();
  // The form button reads "Generating..." while busy, so find it by its tour anchor.
  await expect(page.locator('[data-tour="generate-button"]')).toBeDisabled();
  await evidence.shot("02-regenerating-one-section");
  await evidence.aria("02-regenerating-one-section");

  release();
  await response;
  await page.unroute("**/functions/v1/ai");
  await expect(page.getByText("Section regenerated").first()).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(overlay).toHaveCount(0);
  await expect(page.getByText(thesis).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate Opening" })).toBeEnabled();
  await evidence.shot("03-regenerated");
});

test("gen-error: a provider failure shows an error and the retry succeeds", async ({ signedIn: page, evidence }) => {
  await fake.fail("generate", 500);
  await openGenerate(page);
  await page.getByRole("button", { name: "Generate debate case" }).click();
  // The failure stays on the page, with Retry, until the next run.
  const failure = page.getByRole("alert").filter({ hasText: "Generation failed" });
  await expect(failure).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-failed");
  await expect(page.getByRole("button", { name: "Generate debate case" })).toBeEnabled();

  const response = aiResponse(page, "generate");
  await failure.getByRole("button", { name: "Retry" }).click();
  const body = await response;
  await expect(failure).toHaveCount(0);
  await expect(page.getByText((body.output as unknown as CaseOutput).caseStructure.thesis).first()).toBeVisible();
  await evidence.shot("02-retried");
});

test("gen-cutoff: a case cut off at its length cap is retried once with a larger cap and still appears", async ({ signedIn: page, evidence }) => {
  test.skip(LIVE, "only the fake provider can force a cut-off reply");
  await fake.truncate("generate");
  await openGenerate(page);
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  const body = await response;
  await expect(page.getByText((body.output as unknown as CaseOutput).caseStructure.thesis).first()).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Generation failed" })).toHaveCount(0);
  const caps = (await fake.requests()).filter((request) => request.feature === "generate").map((request) => request.maxTokens ?? 0);
  await evidence.json("01-generate-max-tokens", caps);
  expect(caps).toHaveLength(2);
  expect(caps[1]).toBeGreaterThan(caps[0]);
  await evidence.shot("02-case-after-retry");
});

test("gen-quota: an account without quota is told why and the provider is never called", async ({ signedIn: page, user, evidence }) => {
  await admin.from("user_settings").update({ daily_limit_override: 0 }).eq("user_id", await user.userId());
  await openGenerate(page);
  await page.getByRole("button", { name: "Generate debate case" }).click();
  await expect(page.getByRole("dialog").getByText("Daily AI uses used up")).toBeVisible({ timeout: AI_TIMEOUT });
  await evidence.shot("01-quota-dialog");
  expect((await fake.requests()).filter((request) => request.feature === "generate")).toEqual([]);
});
