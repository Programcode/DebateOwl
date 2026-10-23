import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, test, type Evidence } from "./fixtures";

// Feature map: the Billing entry in features/README.md. Each state is written
// straight into user_settings and subscriptions (what the Stripe webhook
// leaves behind), then Settings, the pricing dialog and an AI request must
// agree on it.

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

type Text = { en: string; hu: string };
type State = {
  name: string;
  settings: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  badge: Text;
  text: { en: RegExp; hu: RegExp };
  /** The one plan button, the same in Settings and the pricing dialog. */
  button: Text;
  /** The pricing dialog card marked Current. */
  plan: "plan-trial" | "plan-pro" | null;
  /** The plan's daily AI uses; null when the account has no access. */
  dailyLimit: number | null;
  /** What a refused AI request opens. */
  refusal: { title: Text; button: Text };
};

const UPGRADE: Text = { en: "Upgrade to Pro", hu: "Váltás Pro-ra" };
const MANAGE: Text = { en: "Manage Subscription", hu: "Előfizetés kezelése" };
const PAUSED: Text = { en: "Daily Access Paused", hu: "Napi hozzáférés szünetel" };
const OK: Text = { en: "OK", hu: "Rendben" };

const STATES: State[] = [
  {
    name: "trial",
    settings: { subscription_tier: "trial", trial_ends_at: at(2.5) },
    badge: { en: "Free Trial", hu: "Ingyenes próba" },
    text: { en: /AI access is active/, hu: /Az MI-hozzáférés aktív/ },
    button: UPGRADE,
    plan: "plan-trial",
    dailyLimit: 5,
    refusal: { title: PAUSED, button: UPGRADE },
  },
  {
    // QB-02: an override on an expired trial is a deliberate grant.
    name: "extended-access",
    settings: { subscription_tier: "trial", trial_ends_at: at(-1), daily_limit_override: 5 },
    badge: { en: "Extended access", hu: "Bővített hozzáférés" },
    text: { en: /Extended access is active: 5 AI uses a day/, hu: /Bővített hozzáférésed van: napi 5 MI-használat/ },
    button: UPGRADE,
    plan: null,
    dailyLimit: 5,
    refusal: { title: PAUSED, button: UPGRADE },
  },
  {
    name: "pro-active",
    settings: { subscription_tier: "pro" },
    subscription: { status: "active", current_period_start: at(-10), current_period_end: at(20), cancel_at_period_end: false },
    badge: { en: "Pro", hu: "Pro" },
    text: { en: /Renews on/, hu: /Megújul:/ },
    button: MANAGE,
    plan: "plan-pro",
    dailyLimit: 50,
    refusal: { title: PAUSED, button: OK },
  },
  {
    // QB-15
    name: "pro-canceling",
    settings: { subscription_tier: "pro" },
    subscription: { status: "active", current_period_start: at(-10), current_period_end: at(20), cancel_at_period_end: true },
    badge: { en: "Pro", hu: "Pro" },
    text: { en: /Cancels on/, hu: /Lemondva, lejár:/ },
    button: MANAGE,
    plan: "plan-pro",
    dailyLimit: 50,
    refusal: { title: PAUSED, button: OK },
  },
  {
    // QA round 3: Pro from a promo code, no Stripe customer. Settings says where
    // Pro came from and that billing can wait until it ends.
    name: "promo-pro",
    settings: { subscription_tier: "pro", grace_period_ends_at: at(365) },
    badge: { en: "Pro", hu: "Pro" },
    text: { en: /comes from a promo code and runs until .+\. Billing is optional until then/, hu: /promóciós kódból származik \(lejárat: .+\)\. Addig a számlázás beállítása nem kötelező/ },
    button: { en: "Set Up Billing", hu: "Számlázás beállítása" },
    plan: "plan-pro",
    dailyLimit: 50,
    refusal: { title: PAUSED, button: OK },
  },
  {
    // QB-13: the tier the old webhook wrote on the first failed invoice.
    name: "past-due-grace",
    settings: { subscription_tier: "expired" },
    subscription: { status: "past_due", current_period_start: at(-2), current_period_end: at(28) },
    badge: { en: "Payment failed", hu: "Sikertelen fizetés" },
    text: { en: /Pro access continues until/, hu: /a Pro-hozzáférésed .+ napjáig megmarad/ },
    button: MANAGE,
    plan: "plan-pro",
    dailyLimit: 50,
    refusal: { title: PAUSED, button: OK },
  },
  {
    // QB-14
    name: "subscription-ended",
    settings: { subscription_tier: "expired", trial_ends_at: at(-60) },
    subscription: { status: "canceled", current_period_start: at(-40), current_period_end: at(-10), ended_at: at(-10) },
    badge: { en: "Expired", hu: "Lejárt" },
    text: { en: /Your Pro subscription ended on/, hu: /A Pro-előfizetésed véget ért/ },
    button: { en: "Resubscribe", hu: "Újra előfizetek" },
    plan: null,
    dailyLimit: null,
    refusal: { title: { en: "Pro Subscription Ended", hu: "A Pro-előfizetés véget ért" }, button: { en: "Resubscribe", hu: "Újra előfizetek" } },
  },
];

/** A state by name, so adding one to the list never shifts another test's pick. */
const stateNamed = (name: string) => STATES.find((candidate) => candidate.name === name)!;

const today = () => new Date().toISOString().slice(0, 10);

async function setState(userId: string, state: State) {
  await admin.from("subscriptions").delete().eq("user_id", userId);
  await admin.from("daily_usage_counters").delete().eq("user_id", userId);
  const { error } = await admin.from("user_settings").update({
    subscription_tier: "trial",
    trial_ends_at: null,
    grace_period_ends_at: null,
    daily_limit_override: null,
    ...state.settings,
  }).eq("user_id", userId);
  if (error) throw error;
  if (state.subscription) {
    const { error: subError } = await admin.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: `cus_verify_${randomUUID()}`,
      stripe_subscription_id: `sub_verify_${randomUUID()}`,
      ...state.subscription,
    });
    if (subError) throw subError;
  }
}

async function chargeAIUnits(userId: string, units: number) {
  await admin.from("daily_usage_counters").delete().eq("user_id", userId);
  const { error } = await admin.from("daily_usage_counters").insert({ user_id: userId, usage_date: today(), quota_key: "ai", request_count: units });
  if (error) throw error;
}

async function brainstorm(page: Page, language: "en" | "hu" = "en") {
  await page.goto("/app/brainstorm");
  await page.getByLabel(language === "en" ? "Motion / Topic *" : "Indítvány / téma *").fill("Public transport should be free");
  await page.getByRole("button", { name: language === "en" ? "Start Brainstorming" : "Ötletelés indítása" }).click();
  if (language === "en") return chooseForMotion(page, "once");
  const dialog = page.getByRole("dialog", { name: /^(Indítasz egy vitát ezzel a tétellel\?|Ez egy másik tétel)$/ });
  await dialog.getByRole("button", { name: /^(Most nem, csak egyszer használom|Egyszeri használat vitába mentés nélkül)$/ }).click();
  await expect(dialog).toBeHidden();
}

async function useHungarian(page: Page) {
  await page.goto("/app/settings");
  await page.getByLabel("Interface Language").click();
  await page.getByRole("option", { name: "Magyar" }).click();
  await expect(page.getByText("Előfizetés", { exact: true })).toBeVisible();
}

// Phones on the touch project, tablet and desktop on the desktop project.
const WIDTHS: Record<string, number[]> = { "mobile-chromium": [360, 375], "desktop-chromium": [768, 1280] };

/** One region at each width this project covers, light and dark. */
async function shots(page: Page, evidence: Evidence, testInfo: TestInfo, name: string, region: () => Locator) {
  const original = page.viewportSize()!;
  for (const width of WIDTHS[testInfo.project.name] ?? [original.width]) {
    await page.setViewportSize({ width, height: original.height });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await region().screenshot({ path: join(evidence.dir, `${name}-${width}-${colorScheme}.png`), animations: "disabled" });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize(original);
}

for (const language of ["en", "hu"] as const) {
  test(`bill-states-${language}: Settings, the pricing dialog and a refused request agree on each billing state`, async ({ signedIn: page, user, evidence }, testInfo) => {
    test.setTimeout(600_000);
    const userId = await user.userId();
    if (language === "hu") await useHungarian(page);
    // The portal needs Stripe. Answer as it does for an account Stripe does
    // not know, which sends Settings to the pricing dialog: the one way a
    // payer reaches it, and the path QB-16 is about.
    let portalCalls = 0;
    await page.route("**/functions/v1/create-portal", (route) => {
      portalCalls += 1;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "No active subscription found. Upgrade to Pro to start a subscription." }) });
    });

    for (const state of STATES) {
      await setState(userId, state);
      await page.goto("/app/settings");
      // That fallback also toasts "No subscription found"; the shots are of the dialog.
      await page.addStyleTag({ content: "[data-sonner-toaster] { display: none !important; }" });
      const card = page.getByTestId("subscription-card");
      await expect(card.getByText(state.badge[language], { exact: true })).toBeVisible();
      await expect(card.getByText(state.text[language])).toBeVisible();
      await expect(card.getByRole("button", { name: state.button[language] })).toBeVisible();
      // QB-02: never "Expired · Your access has expired" beside a working plan.
      await expect(card.getByText(language === "en" ? "Your access has expired" : "A hozzáférésed lejárt", { exact: false })).toHaveCount(0);
      // QB-03: the server's counter, the same number on a tool page.
      if (state.dailyLimit) {
        const usage = language === "en" ? `${state.dailyLimit} of ${state.dailyLimit} AI uses left today` : `Mára ${state.dailyLimit} / ${state.dailyLimit} MI-használat maradt`;
        await expect(card.getByTestId("daily-usage")).toContainText(usage);
      } else {
        await expect(card.getByTestId("daily-usage")).toHaveCount(0);
      }
      await expect(page.getByTestId("trial-banner")).toHaveCount(state.name === "trial" ? 1 : 0);
      await shots(page, evidence, testInfo, `${language}-${state.name}-settings`, () => card);

      // QB-16: the dialog marks the plan the account is on and offers only its next step.
      const portalBefore = portalCalls;
      await card.getByRole("button", { name: state.button[language] }).click();
      const pricing = page.getByRole("dialog");
      if (state.button === MANAGE) await expect.poll(() => portalCalls).toBe(portalBefore + 1);
      await expect(pricing.getByRole("button", { name: state.button[language] })).toBeVisible();
      for (const other of [UPGRADE, MANAGE, { en: "Resubscribe", hu: "Újra előfizetek" }].filter((text) => text.en !== state.button.en)) {
        await expect(pricing.getByRole("button", { name: other[language], exact: true })).toHaveCount(0);
      }
      for (const plan of ["plan-trial", "plan-pro"] as const) {
        await expect(pricing.getByTestId(plan).getByText(language === "en" ? "Current" : "Jelenlegi", { exact: true })).toHaveCount(plan === state.plan ? 1 : 0);
      }
      // IN-07: the price comes from the price config in the reader's format.
      await expect(pricing.getByTestId("plan-pro")).toContainText(language === "en" ? "$5" : "5 $");
      // VS-08: a 44 px close target.
      const close = await pricing.getByRole("button", { name: language === "en" ? "Close" : "Bezárás" }).boundingBox();
      expect(Math.round(close!.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(close!.height)).toBeGreaterThanOrEqual(44);
      await shots(page, evidence, testInfo, `${language}-${state.name}-pricing`, () => page.getByRole("dialog"));
      await page.keyboard.press("Escape");
      await expect(pricing).toBeHidden();

      // QB-06: a refused request opens the same dialog in every state's own words.
      if (state.dailyLimit) await chargeAIUnits(userId, state.dailyLimit);
      await brainstorm(page, language);
      const refused = page.getByRole("dialog");
      await expect(refused.getByText(state.refusal.title[language], { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
      await expect(refused.getByRole("button", { name: state.refusal.button[language] })).toBeVisible();
      await expect(refused.getByText(/non-2xx|Edge Function/)).toHaveCount(0);
      await shots(page, evidence, testInfo, `${language}-${state.name}-limit`, () => page.getByRole("dialog"));
      await page.keyboard.press("Escape");
    }
    await evidence.step(`${language}: each state shows its own badge, usage, pricing dialog and refusal`);
  });
}

// VS-06: the Spanish card at phone widths too (the matrix above covers EN and HU).
test("bill-states-es: the Spanish subscription card wraps instead of squeezing", async ({ signedIn: page, user, evidence }, testInfo) => {
  const userId = await user.userId();
  await page.goto("/app/settings");
  await page.getByLabel("Interface Language").click();
  await page.getByRole("option", { name: "Español" }).click();
  await expect(page.getByText("Suscripción", { exact: true })).toBeVisible();
  const ES: Record<string, { badge: string; button: string }> = {
    "trial": { badge: "Prueba gratis", button: "Mejorar a Pro" },
    "pro-canceling": { badge: "Pro", button: "Gestionar suscripción" },
    "past-due-grace": { badge: "Pago fallido", button: "Gestionar suscripción" },
  };
  for (const state of STATES.filter((candidate) => candidate.name in ES)) {
    await setState(userId, state);
    await page.goto("/app/settings");
    const card = page.getByTestId("subscription-card");
    await expect(card.getByText(ES[state.name].badge, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: ES[state.name].button })).toBeVisible();
    await shots(page, evidence, testInfo, `es-${state.name}-settings`, () => card);
  }
  await evidence.step("es: trial, cancelling and past-due cards");
});

test("bill-usage: the tool pages show the server's weighted count, and it updates after a run", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();
  await setState(userId, STATES[0]);
  // Three units already charged today, as a weighted model or a Sparring round leaves them.
  await chargeAIUnits(userId, 3);

  await page.goto("/app/settings");
  await expect(page.getByTestId("daily-usage")).toContainText("2 of 5 AI uses left today");
  for (const tool of ["generate", "attack", "brainstorm", "factoids", "ask", "crossfire", "sparring"]) {
    await page.goto(`/app/${tool}`);
    await expect(page.getByTestId("daily-usage")).toHaveText("2 of 5 AI uses left today");
  }
  await evidence.shot("01-sparring-header");

  const served = aiResponse(page, "brainstorm");
  await brainstorm(page);
  await served;
  // No reload: the count is read again after the request.
  await expect(page.getByTestId("daily-usage")).toHaveText("1 of 5 AI uses left today");
  await evidence.shot("02-brainstorm-after-run");
  await evidence.step("Settings and every tool show 2 of 5 left; one run later Brainstorm shows 1 of 5 without a reload");
});

test("bill-trial-banner: the trial banner counts down, opens the plans and stays dismissed", async ({ signedIn: page, user, evidence }) => {
  await setState(await user.userId(), STATES[0]);
  await page.goto("/app");
  const banner = page.getByTestId("trial-banner");
  await expect(banner).toContainText(/Free trial: [23] days left\./);
  await evidence.shot("01-banner");
  await banner.getByRole("button", { name: "Upgrade to Pro" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Upgrade to Pro" })).toBeVisible();
  await page.keyboard.press("Escape");
  await banner.getByRole("button", { name: "Hide the trial reminder" }).click();
  await expect(banner).toHaveCount(0);
  // Once the plan has loaded again (the Settings badge), the banner stays away.
  await page.goto("/app/settings");
  await expect(page.getByTestId("subscription-card").getByText("Free Trial", { exact: true })).toBeVisible();
  await expect(page.getByTestId("trial-banner")).toHaveCount(0);
  await evidence.step("Trial banner shows days left, opens the pricing dialog, and stays hidden after dismissal");
});

test("bill-redirect: /app/billing opens the Settings subscription section", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/billing");
  await expect(page).toHaveURL(/\/app\/settings#subscription$/);
  await expect(page.getByTestId("subscription-card")).toBeInViewport();
  await evidence.shot("01-billing-redirect");
  await evidence.step("QB-12: /app/billing lands on Settings with the subscription card in view");
});

test("bill-access: extended access is served; a past-due payer after the grace is sent to Settings", async ({ signedIn: page, user, evidence }) => {
  const userId = await user.userId();

  // QB-02: extended access really is served.
  await setState(userId, stateNamed("extended-access"));
  const served = aiResponse(page, "brainstorm");
  await brainstorm(page);
  expect(((await served).output.topFive as unknown[]).length).toBeGreaterThan(0);
  await evidence.shot("ai-extended-access-served");

  // QB-13: past the grace, a past-due payer is refused with payment_failed and sent to Settings, not Checkout.
  await setState(userId, {
    ...stateNamed("past-due-grace"),
    subscription: { status: "past_due", current_period_start: at(-20), current_period_end: at(10) },
  });
  await brainstorm(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Payment Failed", { exact: true })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(dialog.getByText(/free trial/i)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Upgrade to Pro/ })).toHaveCount(0);
  await evidence.shot("ai-payment-failed-refused");
  await dialog.getByRole("button", { name: "Update payment method" }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByText("Payment failed", { exact: true })).toBeVisible();
  await evidence.step("Extended access is served; a past-due payer after the grace gets Payment Failed and goes to Settings");
});
