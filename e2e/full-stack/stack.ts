import { expect, test as base, type Page } from "@playwright/test";
import { createDemoUser, deleteDemoUser, fake, type DemoUser, type FakeRequest } from "./stack-core";

export * from "./stack-core";

/** Sign in through the real Login page and demo-code-login Edge Function. */
export async function signIn(page: Page, user: DemoUser) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Demo code" }).click();
  await page.getByRole("textbox", { name: "Demo code" }).fill(user.code);
  await page.getByRole("button", { name: "Sign in with demo code" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

/**
 * Waits for a tool's finished result to show `text`. A live draft shows the
 * text while the request is still running, before the result is saved and
 * billed, so seeing the text alone does not mean the run is done.
 */
export async function expectResult(page: Page, text: string, timeout = 30_000) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout });
  await expect(page.getByTestId("live-draft")).toHaveCount(0, { timeout });
  await expect(page.getByText(text).first()).toBeVisible();
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
    await page.getByRole("dialog").getByRole("button", { name: "Start new debate" }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motion").fill(motion);
  await dialog.getByRole("button", { name: "Start debate" }).click();
  await expect(dialog).toBeHidden();
  await expect(debateControl(page)).toHaveAttribute("aria-label", `Current debate: ${motion}`);
}

/**
 * Chooses one-off mode from the debate strip before submitting. Generate starts
 * a debate for a new motion without asking, so "use once" is chosen up front.
 */
export async function chooseOneOff(page: Page) {
  const strip = page.getByTestId("current-debate-strip");
  await strip.getByRole("button", { name: "Use once", exact: true }).click();
  await expect(strip).toContainText("One-off mode");
}

/**
 * Answers the motion check after submitting a motion that is not the Current
 * Debate: the first-debate offer when none is current, otherwise the switch choice.
 */
export async function chooseForMotion(page: Page, choice: "create" | "once") {
  // Scope to the motion choice: the next step may open its own dialog, such as the paywall.
  const dialog = page.getByRole("dialog", { name: /^(Start a debate with this motion\?|This is a different motion)$/ });
  await dialog.getByRole("button", {
    name: choice === "create"
      ? /^(Start debate|Create a new debate for this motion)$/
      : /^(Not now, use it once|Use once without saving to a debate)$/,
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
