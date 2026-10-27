import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin, expect, test } from "./fixtures";

// Feature map: features/localization.md (T12: IN-01, SE-01, IN-03, IN-04, IN-11, IN-14).

const catalog = (language: string) => JSON.parse(readFileSync(`src/locales/${language}.json`, "utf8"));
const en = catalog("en");
const es = catalog("es");
const hu = catalog("hu");
const site = JSON.parse(readFileSync("src/config/site.json", "utf8"));
const BRAND = site.brand;
const head = (text: string) => text.replace("{{brand}}", BRAND).replace("{{product}}", site.product);
const LANGUAGE_NAMES = { en: "English", es: "Español", hu: "Magyar" } as const;
/** The switcher's own name in whichever language is showing. */
const SWITCHER_NAME = new RegExp(`^(${[en, es, hu].map((strings) => strings.langSwitcher.label).join("|")})$`);

const APP_ROUTES = ["/app", "/app/generate", "/app/attack", "/app/history", "/app/settings"];
const PUBLIC_ROUTES = ["/terms", "/privacy", "/tools", "/no-such-page"];

/** Phones at 375 px, the width the QA report used; desktop keeps the project's 1280. */
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 375, height: page.viewportSize()!.height });
});

async function chooseLanguage(page: Page, language: keyof typeof LANGUAGE_NAMES) {
  await page.getByRole("button", { name: SWITCHER_NAME }).first().click();
  await page.getByRole("radiogroup").first().getByRole("radio", { name: LANGUAGE_NAMES[language] }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", language);
}

/** The tab title once the page has set its own (the shell's is just "DebateOwl"). */
async function pageTitle(page: Page, route: string) {
  await page.goto(route);
  await expect.poll(() => page.title()).not.toBe("DebateOwl");
  return page.title();
}

test("loc-titles: every route's tab title is its own and follows the interface language", async ({ signedIn: page, evidence }) => {
  const titles: Record<string, Record<string, string>> = {};
  for (const language of ["en", "hu", "es"] as const) {
    await page.goto(`/app?lang=${language}`);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    titles[language] = {};
    for (const route of [...APP_ROUTES, ...PUBLIC_ROUTES]) titles[language][route] = await pageTitle(page, route);
    await evidence.step(`Recorded document.title on ${APP_ROUTES.length + PUBLIC_ROUTES.length} routes in ${language}`);
  }
  await evidence.json("01-document-titles", titles);

  for (const route of APP_ROUTES) {
    for (const language of ["en", "hu", "es"]) expect(titles[language][route]).toMatch(/ · DebateOwl$/);
  }
  for (const route of PUBLIC_ROUTES) {
    for (const language of ["en", "hu", "es"]) expect(titles[language][route]).toMatch(new RegExp(`\\| ${BRAND}$`));
  }
  expect(titles.en["/app/generate"]).toBe(`${en.nav.generate} · DebateOwl`);
  expect(titles.hu["/app/generate"]).toBe(`${hu.nav.generate} · DebateOwl`);
  expect(titles.hu["/no-such-page"]).toBe(hu.pageHead.notFound.title.replace("{{brand}}", BRAND));
  // Each language names every page in its own words (the brand aside).
  for (const route of [...APP_ROUTES, ...PUBLIC_ROUTES]) {
    expect(titles.hu[route], route).not.toBe(titles.en[route]);
  }

  // A switch retitles the page on screen, with no reload.
  await page.goto("/app/attack");
  await chooseLanguage(page, "en");
  await expect(page).toHaveTitle(`${en.nav.attack} · DebateOwl`);
  await chooseLanguage(page, "hu");
  await expect(page).toHaveTitle(`${hu.nav.attack} · DebateOwl`);
  await evidence.shot("02-attack-title-hu");
});

test("loc-validation: an empty Attack shows its required-field error in the interface language, only after submit", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/attack?lang=hu");
  const caseText = page.getByRole("textbox", { name: new RegExp(hu.attackForm.argument) });
  await expect(caseText).toBeVisible();
  await expect(page.getByText(hu.validation.caseTextRequired)).toHaveCount(0);
  await evidence.shot("01-attack-hu-before-submit");
  await evidence.aria("01-attack-hu-before-submit", page.getByRole("main"));

  await page.getByRole("button", { name: hu.attackForm.submit }).click();
  await expect(page.getByText(hu.validation.caseTextRequired)).toBeVisible();
  await expect(page.getByText(en.validation.caseTextRequired)).toHaveCount(0);
  await evidence.step("Submitted an empty Attack in Hungarian");
  await evidence.shot("02-attack-hu-required");

  await chooseLanguage(page, "es");
  await expect(page.getByText(es.validation.caseTextRequired)).toBeVisible();
  await evidence.shot("03-attack-es-required");
});

test("loc-switcher: sign-in and not-found pages carry the language switcher", async ({ page, evidence }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: en.login.title })).toBeVisible();
  await evidence.shot("01-login-en");
  await chooseLanguage(page, "hu");
  await expect(page.getByRole("heading", { level: 1, name: hu.login.title })).toBeVisible();
  // "Bejelentkezés a DebateOwlba" already names the app, so it gets no suffix.
  await expect(page).toHaveTitle(hu.login.title);
  await evidence.shot("02-login-hu");

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: hu.notFound.title })).toBeVisible();
  await expect(page).toHaveTitle(hu.pageHead.notFound.title.replace("{{brand}}", BRAND));
  await evidence.shot("03-not-found-hu");
  await chooseLanguage(page, "es");
  await expect(page).toHaveTitle(es.pageHead.notFound.title.replace("{{brand}}", BRAND));
  await expect(page.getByText(es.notFound.message)).toBeVisible();
  await evidence.shot("04-not-found-es");
});

test("loc-links: ?lang= opens the landing page in that language, and /es and /hu are pages of their own", async ({ page, evidence }) => {
  await page.goto("/?lang=hu");
  await expect(page.locator("html")).toHaveAttribute("lang", "hu");
  await expect(page).toHaveTitle(head(hu.pageHead.home.title));
  // The choice is kept and the address drops the parameter.
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await evidence.shot("01-landing-lang-hu");

  await page.goto("/es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle(head(es.pageHead.home.title));
  expect(new URL(page.url()).pathname).toBe("/es");
  await evidence.shot("02-landing-es");

  await page.goto("/hu");
  await expect(page.locator("html")).toHaveAttribute("lang", "hu");
  // Start leads into the app in Hungarian, and the choice survives a reload.
  await page.getByRole("link", { name: hu.nav.startTrial }).first().click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/hu");
  await expect(page.locator("html")).toHaveAttribute("lang", "hu");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hu");
  await evidence.shot("03-start-from-hu");
});

test("loc-server-error: a refused promo code reads in the interface language", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  // The promo field shows for an account that would start a Checkout.
  await admin.from("user_settings")
    .update({ subscription_tier: "expired", trial_ends_at: null, grace_period_ends_at: null, daily_limit_override: null })
    .eq("user_id", userId);
  await page.goto("/app/settings?lang=hu");
  await page.getByRole("button", { name: hu.billing.upgradeToPro }).first().click();
  await page.getByRole("button", { name: hu.pricingModal.promoCode }).click();
  await page.getByPlaceholder(hu.pricingModal.promoPlaceholder).fill(`NOPE${randomUUID().slice(0, 6).toUpperCase()}`);
  const answer = page.waitForResponse((response) => response.url().includes("/functions/v1/redeem-promo"));
  await page.getByRole("button", { name: hu.pricingModal.apply, exact: true }).click();
  const body = await (await answer).json();
  await evidence.json("01-redeem-promo-answer", body);
  // The server still sends English beside the code; the screen shows the translation.
  expect(body).toMatchObject({ success: false, code: "promo_invalid", message: en.serverErrors.promoInvalid });
  await expect(page.getByText(hu.serverErrors.promoInvalid).first()).toBeVisible();
  await expect(page.getByText(en.serverErrors.promoInvalid)).toHaveCount(0);
  await evidence.shot("02-promo-refused-hu");
});
