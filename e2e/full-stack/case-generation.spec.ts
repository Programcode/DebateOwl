import { readFile } from "node:fs/promises";
import { admin, expect, fake, MARK, providerCall, signIn, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

const motion = "This House would make public transport free";

test("a signed-in user generates a case grounded in a saved Library source", async ({ signedIn: page, user }) => {
  const marker = `SOURCE-${Date.now()}`;
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Source title..." }).fill("Tallinn fare study");
  // Imported articles are often this long. Inlining that text in the request
  // exceeded the Edge Function's 200 KB body limit before sources loaded server-side.
  await page.getByRole("textbox", { name: "Paste source content..." })
    .fill(`${marker} Tallinn ridership rose 14 percent after fares were removed. ${"Detailed ridership evidence. ".repeat(9_000)}`);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByText("Grounding Active")).toBeVisible();

  const userId = await user.userId();
  const { data: sources } = await admin.from("sources").select("id,is_active").eq("user_id", userId);
  expect(sources).toEqual([expect.objectContaining({ is_active: true })]);

  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();

  // A hang (as in the auth relock regression) fails here instead of spinning forever.
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`${MARK} contention 3`)).toBeVisible();

  const call = await providerCall("generate");
  expect(call.user).toContain(`Motion: ${motion}`);
  // The Edge Function loaded the persisted source itself and grounded the prompt in it.
  expect(call.system).toContain(marker);

  const { data: usage } = await admin.from("ai_requests").select("feature,status").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success" }));
});

test("a provider failure shows an error and lets the user retry", async ({ signedIn: page }) => {
  await fake.fail("generate", 500);
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();

  await expect(page.getByText("Generation Failed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Generate Debate Case" })).toBeEnabled();

  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
});

test("an account without quota is told why generation is blocked", async ({ signedIn: page, user }) => {
  await admin.from("user_settings").update({ daily_limit_override: 0 }).eq("user_id", await user.userId());
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();

  await expect(page.getByRole("dialog").getByText("Daily Access Paused")).toBeVisible({ timeout: 30_000 });
  expect((await fake.requests()).filter((request) => request.feature === "generate")).toEqual([]);
});

test("a saved case persists to the account and reloads from History", async ({ signedIn: page, user }) => {
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });

  const title = `Saved case ${Date.now()}`;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Case title").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("title").eq("user_id", await user.userId());
    return data?.map((row) => row.title);
  }).toEqual([title]);

  // A fresh browser context has no local copy, so History must hydrate from the database.
  const fresh = await page.context().browser()!.newContext();
  const other = await fresh.newPage();
  await other.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
  await signIn(other, user);
  await other.goto("/app/history");
  await expect(other.getByText(title)).toBeVisible();
  await fresh.close();
});

test("a generated case exports to PDF and DOCX files", async ({ signedIn: page }) => {
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });

  // PDF files start with "%PDF"; DOCX files are ZIP archives starting with "PK".
  for (const [button, extension, magic] of [["PDF", ".pdf", "%PDF"], ["DOCX", ".docx", "PK"]] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`));
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, magic.length).toString("latin1"), `${button} file signature`).toBe(magic);
  }
});
