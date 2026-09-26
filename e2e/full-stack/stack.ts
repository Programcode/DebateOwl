import { createClient } from "@supabase/supabase-js";
import { expect, test as base, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";

// These specs drive the real local stack: Supabase Auth, Postgres/RLS, every
// Edge Function, and a fake OpenRouter (e2e/full-stack/fake-openrouter.mjs).
// Only the paid model provider is replaced. `.superset/db-gate.sh` provides the
// environment below; without it the specs skip.
const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const fakeUrl = process.env.FAKE_OPENROUTER_URL;
const demoPepper = process.env.DEMO_CODE_PEPPER;

export const MARK = "FAKE-PROVIDER";
export const stackReady = Boolean(supabaseUrl && serviceKey && fakeUrl && demoPepper);
// Only the locked gate loads these specs in CI; a skip there would read as a pass.
if (process.env.CI && !stackReady) throw new Error("Full-stack gate environment is incomplete");

export const admin = stackReady
  ? createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } })
  : (null as never);

export type FakeRequest = { feature: string | null; model?: string; stream?: boolean; system: string; user: string };

export const fake = {
  async reset() {
    await fetch(`${fakeUrl}/__reset`, { method: "POST" });
  },
  async requests(): Promise<FakeRequest[]> {
    return (await fetch(`${fakeUrl}/__requests`)).json();
  },
  async fail(feature: string, status = 500, count = 1) {
    await fetch(`${fakeUrl}/__fail`, { method: "POST", body: JSON.stringify({ feature, status, count }) });
  },
};

export type DemoUser = { code: string; email: string; userId: () => Promise<string> };

async function userIdFor(email: string) {
  // The local project holds only test users, so one page covers it.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`No user for ${email}`);
  return user.id;
}

export async function createDemoUser(label: string): Promise<DemoUser & { codeId: string }> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const code = `DEMO-${part()}-${part()}`;
  const email = `${label}-${randomUUID()}@fullstack.test`;
  const codeHash = createHash("sha256").update(`${demoPepper}:${code}`).digest("hex");
  const { data, error } = await admin.from("demo_access_codes")
    .insert({ code_hash: codeHash, label, email, max_uses: 10 })
    .select("id")
    .single();
  if (error) throw error;
  return { code, email, codeId: data.id, userId: () => userIdFor(email) };
}

export async function deleteDemoUser(user: DemoUser & { codeId: string }) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = data?.users.find((candidate) => candidate.email === user.email)?.id;
  if (id) await admin.auth.admin.deleteUser(id);
  await admin.from("demo_access_codes").delete().eq("id", user.codeId);
}

/** Sign in through the real Login page and demo-code-login Edge Function. */
export async function signIn(page: Page, user: DemoUser) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Demo code" }).click();
  await page.getByRole("textbox", { name: "Demo code" }).fill(user.code);
  await page.getByRole("button", { name: "Sign in with demo code" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

/** The visible Current Debate control: the header menu on desktop, the second header row on mobile. */
export function debateControl(page: Page) {
  return page.locator('[data-testid="current-debate-desktop"]:visible, [data-testid="current-debate-mobile"]:visible').first();
}

/** Starts a new Current Debate from the header, as a student would. */
export async function startDebate(page: Page, motion: string) {
  if (!page.url().includes("/app")) await page.goto("/app");
  const control = debateControl(page);
  if ((await control.textContent())?.includes("Start debate")) {
    await control.click();
  } else {
    await control.click();
    await page.getByRole("button", { name: "Start new debate" }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motion").fill(motion);
  await dialog.getByRole("button", { name: "Start debate" }).click();
  await expect(dialog).toBeHidden();
  await expect(debateControl(page)).toHaveAttribute("aria-label", `Current debate: ${motion}`);
}

/** Answers "Which debate is this for?" after submitting a motion that is not the Current Debate. */
export async function chooseForMotion(page: Page, choice: "create" | "once") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {
    name: choice === "create" ? "Create a new debate for this motion" : "Use once without saving to a debate",
  }).click();
  await expect(dialog).toBeHidden();
}

type Fixtures = { user: DemoUser; signedIn: Page };

export const test = base.extend<Fixtures>({
  // Playwright requires a destructuring pattern even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  user: async ({}, provide, testInfo) => {
    const created = await createDemoUser(testInfo.project.name);
    await provide(created);
    await deleteDemoUser(created);
  },
  page: async ({ page }, provide) => {
    // Any uncaught exception fails the test, even when the visible flow passes.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Init scripts rerun on every load, so seed only what the app has not written.
    await page.addInitScript(() => {
      const seed = (key: string, state: Record<string, unknown>) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
      };
      seed("debate-trainer-onboarding", { hasCompletedOnboarding: true, isTourRunning: false });
      seed("debate-trainer-settings", { language: "en", outputLanguage: "en", theme: "system" });
    });
    await fake.reset();
    await provide(page);
    expect(errors, "uncaught page errors").toEqual([]);
    // Overflow widens the mobile layout viewport and pushes controls off-screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal page overflow in px").toBeLessThanOrEqual(1);
  },
  signedIn: async ({ page, user }, provide) => {
    await signIn(page, user);
    await provide(page);
  },
});

export { expect };

/** Waits for one fake-provider call for a feature and returns it. */
export async function providerCall(feature: string) {
  let match: FakeRequest | undefined;
  await expect.poll(async () => {
    match = (await fake.requests()).find((request) => request.feature === feature);
    return Boolean(match);
  }, { message: `provider call for ${feature}` }).toBe(true);
  return match!;
}
