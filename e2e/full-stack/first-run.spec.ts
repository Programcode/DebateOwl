import type { Page } from "@playwright/test";
import { admin, type DemoUser, expect, MARK, providerCall, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

// A brand-new account, signed up through a demo code, meets the app the way a
// student does: language chosen before sign-in, tour not yet seen, no debates.
const copy = {
  en: {
    demoTab: "Demo code",
    demoCode: "Demo code",
    signIn: "Sign in with demo code",
    welcome: "Welcome to DebateLab!",
    firstDebate: "Start your first debate here.",
    startDebate: "Start debate",
    motionField: "Motion",
    library: "Library",
    generate: "Generate",
    finish: "Get Started!",
    skip: "Skip Tour",
    generateMotion: "Motion / Topic *",
    generateSubmit: "Generate Debate Case",
    offerTitle: "Start a debate with this motion?",
    workingIn: "Working in:",
    tourMotion: "This House would ban homework",
    gateMotion: "This House would abolish zoos",
  },
  hu: {
    demoTab: "Demókód",
    demoCode: "Demókód",
    signIn: "Bejelentkezés demókóddal",
    welcome: "Üdvözlünk a DebateLab-ban!",
    firstDebate: "Itt indíthatod el az első vitádat.",
    startDebate: "Vita indítása",
    motionField: "Tétel",
    library: "Forráskönyvtár",
    generate: "Generálás",
    finish: "Kezdjük!",
    skip: "Túra Kihagyása",
    generateMotion: "Indítvány / Téma *",
    generateSubmit: "Vitaeset Generálása",
    offerTitle: "Indítasz egy vitát ezzel a tétellel?",
    workingIn: "Munka ebben:",
    tourMotion: "Ez a Ház betiltaná a házi feladatot",
    gateMotion: "Ez a Ház bezárná az állatkerteket",
  },
} as const;

type Locale = keyof typeof copy;

async function signUpFresh(page: Page, user: DemoUser, locale: Locale) {
  // The shared fixture marks the tour as seen and picks English; a new student has neither.
  await page.addInitScript((language) => {
    if (sessionStorage.getItem("first-run-seeded")) return;
    sessionStorage.setItem("first-run-seeded", "1");
    localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: false, isTourRunning: false }, version: 0 }));
    localStorage.setItem("debate-trainer-settings", JSON.stringify({ state: { language, outputLanguage: language, theme: "system" }, version: 0 }));
  }, locale);
  const text = copy[locale];
  await page.goto("/login");
  await page.getByRole("tab", { name: text.demoTab }).click();
  await page.getByRole("textbox", { name: text.demoCode }).fill(user.code);
  await page.getByRole("button", { name: text.signIn }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

async function serverDebates(user: DemoUser) {
  const userId = await user.userId();
  const [{ data: debates }, { data: current }] = await Promise.all([
    admin.from("debates").select("id,motion").eq("user_id", userId),
    admin.from("current_debates").select("debate_id").eq("user_id", userId).maybeSingle(),
  ]);
  return { debates: debates ?? [], currentId: current?.debate_id ?? null };
}

for (const locale of ["en", "hu"] as const) {
  const text = copy[locale];

  test(`[${locale}] a fresh account starts its first debate from the tour`, async ({ page, user }) => {
    test.setTimeout(90_000);
    await signUpFresh(page, user, locale);

    const tooltip = page.locator(".react-joyride__tooltip");
    const next = page.locator('[data-test-id="button-primary"]');
    await expect(tooltip).toContainText(text.welcome, { timeout: 15_000 });
    await expect(tooltip).toContainText(text.firstDebate);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    await tooltip.getByRole("button", { name: text.startDebate }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(text.motionField).fill(text.tourMotion);
    await dialog.getByRole("button", { name: text.startDebate }).click();
    await expect(dialog).toBeHidden();

    await expect(tooltip).toContainText(text.library);
    await next.click();
    await expect(tooltip).toContainText(text.generate);
    await next.click();
    await page.getByRole("button", { name: text.finish }).click();
    await expect(tooltip).toHaveCount(0);

    const { debates, currentId } = await serverDebates(user);
    expect(debates.map((debate) => debate.motion)).toEqual([text.tourMotion]);
    expect(currentId).toBe(debates[0].id);
    // The language picked before sign-up survives the first sign-in and is saved.
    const { data: settings } = await admin.from("user_settings").select("language").eq("user_id", await user.userId()).single();
    expect(settings?.language).toBe(locale);

    // The first tool already works inside that debate, with no motion check.
    await page.locator('main [data-tour="mode-generate"]').click();
    await expect(page.getByTestId("current-debate-strip")).toContainText(`${text.workingIn} ${text.tourMotion}`);
    await expect(page.getByRole("textbox", { name: text.generateMotion })).toHaveValue(text.tourMotion);
    await page.getByRole("button", { name: text.generateSubmit }).click();
    await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await providerCall("generate")).user).toContain(`Motion: ${text.tourMotion}`);
    await expect.poll(async () => {
      const { data } = await admin.from("cases").select("debate_id").eq("user_id", await user.userId());
      return data?.map((row) => row.debate_id);
    }).toEqual([debates[0].id]);
  });

  test(`[${locale}] a fresh account that skips the tour is offered a debate from its motion`, async ({ page, user }) => {
    test.setTimeout(90_000);
    await signUpFresh(page, user, locale);
    await page.locator('[data-test-id="button-skip"]').click();
    await expect(page.locator(".react-joyride__tooltip")).toHaveCount(0);

    await page.locator('main [data-tour="mode-generate"]').click();
    await page.getByRole("textbox", { name: text.generateMotion }).fill(text.gateMotion);
    await page.getByRole("button", { name: text.generateSubmit }).click();

    const offer = page.getByRole("dialog", { name: text.offerTitle });
    await expect(offer).toContainText(text.gateMotion);
    await offer.getByRole("button", { name: text.startDebate }).click();
    await expect(offer).toBeHidden();

    await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("current-debate-strip")).toContainText(`${text.workingIn} ${text.gateMotion}`);
    const { debates, currentId } = await serverDebates(user);
    expect(debates.map((debate) => debate.motion)).toEqual([text.gateMotion]);
    expect(currentId).toBe(debates[0].id);
    await expect.poll(async () => {
      const { data } = await admin.from("cases").select("debate_id").eq("user_id", await user.userId());
      return data?.map((row) => row.debate_id);
    }).toEqual([debates[0].id]);
  });
}
