import { test as base, type Browser } from "@e2e-dev/web";
import { expect, type Screen } from "e2e";
import { admin, createDemoUser, deleteDemoUser, stackReady, type DemoUser } from "../../e2e/full-stack/stack-core";

export { admin, fake, MARK } from "../../e2e/full-stack/stack-core";
export { expect };

export const LIVE = process.env.VERIFY_MODE === "live";
/** Budget for anything behind a model call: fake answers are instant, live ones are not. */
export const AI_TIMEOUT = LIVE ? 240_000 : 30_000;

const hasModel = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Options for a test with agent steps. `agent.assert`, `waitFor` and `extract`
 * always call the model, so without a key the test skips at collection rather
 * than spending a minute on provider retries. The stack check keeps a plain
 * `npx e2e run` from minting users nowhere.
 */
export const agentic = {
  skip: !stackReady
    ? "no verification stack environment; run through verify.sh e2e"
    : !hasModel
      ? "OPENROUTER_API_KEY is not set; run through verify.sh e2e"
      : false,
} as const;

const labels = {
  en: { tab: "Demo code", field: "Demo code", submit: "Sign in with demo code" },
  hu: { tab: "Demókód", field: "Demókód", submit: "Bejelentkezés demókóddal" },
} as const;

type Language = keyof typeof labels;
type StudentOptions = { tour?: boolean; language?: Language };
export type Student = DemoUser & { codeId: string };

/** Persisted client state the app reads at boot. e2e has no init scripts, so the caller reloads. */
async function seedClientState(browser: Browser, { tour = false, language = "en" }: StudentOptions) {
  await browser.evaluate((seed: { tourPending: boolean; language: string }) => {
    localStorage.setItem("debate-trainer-onboarding", JSON.stringify({
      state: { hasCompletedOnboarding: !seed.tourPending, isTourRunning: false },
      version: 0,
    }));
    localStorage.setItem("debate-trainer-settings", JSON.stringify({
      state: { language: seed.language, outputLanguage: seed.language, theme: "system" },
      version: 0,
    }));
    return null;
  }, { tourPending: tour, language });
}

/** Signs in through the real Login page and demo-code-login Edge Function. */
async function signIn(screen: Screen, browser: Browser, code: string, language: Language) {
  const copy = labels[language];
  await screen.getByRole("tab", copy.tab).tap();
  await screen.getByRole("textbox", copy.field).fill(code);
  await screen.getByRole("button", copy.submit).tap();
  await browser.waitForURL(/\/app$/, { timeout: 20_000 });
}

/**
 * A `test` whose `student` fixture is a fresh demo-code user (Pro, daily limit
 * 999, no Current Debate), signed in and deleted afterwards. Any request to a
 * hosted Supabase project is aborted and fails the test, and so does a page
 * wider than its viewport.
 */
function studentTest(options: StudentOptions = {}) {
  const language = options.language ?? "en";
  return base.extend<{ student: Student }>({
    student: async ({ app, screen, browser }, provide) => {
      const remote: string[] = [];
      await browser.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
        remote.push(route.request.url);
        await route.abort();
      });
      const user = await createDemoUser(`agentic-${language}`);
      try {
        await app.open("/login");
        await seedClientState(browser, options);
        await browser.reload();
        await signIn(screen, browser, user.code, language);
        await provide(user);
        const overflow = await browser.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "horizontal page overflow in px").toBeLessThanOrEqual(1);
        expect(remote, "requests to a hosted Supabase project").toEqual([]);
      } finally {
        await deleteDemoUser(user);
      }
    },
  });
}

/** A signed-in student who has already seen the onboarding tour. */
export const test = studentTest();
/** A brand-new account: the onboarding tour starts on /app. */
export const firstRunTest = studentTest({ tour: true });
/** A signed-in student using the Hungarian interface. */
export const hungarianTest = studentTest({ language: "hu" });

/** The visible header Current Debate control on either viewport. */
export function debateControl(browser: Browser) {
  return browser.locator('[data-testid="current-debate-desktop"]:visible, [data-testid="current-debate-mobile"]:visible');
}

/** The `debates` rows a user owns, read through the service role. */
export async function debatesOf(student: Student) {
  const { data, error } = await admin.from("debates").select("id, motion").eq("user_id", await student.userId());
  if (error) throw error;
  return data;
}
