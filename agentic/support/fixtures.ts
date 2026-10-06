import { test as base, type Browser } from "@e2e-dev/web";
import { expect, type Screen } from "e2e";
import { admin, createDemoUser, deleteDemoUser, MARK, stackReady, type DemoUser } from "../../e2e/full-stack/stack-core";

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
  es: { tab: "Código demo", field: "Código demo", submit: "Iniciar sesión con código demo" },
  hu: { tab: "Demókód", field: "Demókód", submit: "Bejelentkezés demókóddal" },
} as const;

export type Language = keyof typeof labels;
export const LANGUAGES = Object.keys(labels) as Language[];
type StudentOptions = { tour?: boolean; language?: Language };
export type Student = DemoUser & { codeId: string };

/**
 * Persisted client state the app reads at boot; the caller reloads. Seeded
 * once rather than as an init script, which would reseed on every navigation
 * and undo what the app writes during the test.
 */
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
 * What `support/capture-errors.js` recorded in this tab: uncaught errors,
 * rejected promises, console.error, and Supabase 5xx answers. Reading clears
 * the list.
 */
export async function pageErrors(browser: Browser): Promise<string[]> {
  return browser.evaluate(() => {
    const list = JSON.parse(sessionStorage.getItem("__agentic_errors") || "[]") as string[];
    sessionStorage.removeItem("__agentic_errors");
    return list;
  });
}

/**
 * Visible text that crosses the left or right edge of the screen. A wrapper
 * with `overflow-x: hidden` keeps the page from scrolling sideways while it
 * cuts such text off, so the page-width check alone misses it. Each text node
 * is measured, not its element's box, and clipped the way the browser clips
 * it: by the ancestors on its containing-block chain, and by `clip` and
 * `clip-path`. Text clipped away entirely (a drawer off canvas, an `sr-only`
 * label) does not count; text that shows right up to the edge and continues
 * past it does. Text in a container that scrolls sideways on purpose (a table,
 * a carousel) or pans (the Flowchart canvas) is exempt.
 *
 * Text cut short inside the screen is out of scope on purpose. An ellipsis,
 * a scroll area, a carousel and a line clamp all clip inside the page by
 * design, so a geometric rule would fail them; the page sweep's judge checks
 * for text that is cut off.
 */
export async function textPastTheEdge(browser: Browser): Promise<string[]> {
  return browser.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text && found.length < 5; text = walker.nextNode()) {
      const el = text.parentElement;
      if (!el || !text.textContent?.trim()) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest(".react-flow__viewport")) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const box = range.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (box.right <= width + 1 && box.left >= -1) continue;
      // What of the text survives every clipping ancestor and the screen.
      let left = Math.max(box.left, 0);
      let right = Math.min(box.right, width);
      let top = box.top;
      let bottom = box.bottom;
      let exempt = false;
      const cut = (area: { left: number; right: number; top: number; bottom: number }, x: boolean, y: boolean) => {
        if (x) { left = Math.max(left, area.left); right = Math.min(right, area.right); }
        if (y) { top = Math.max(top, area.top); bottom = Math.min(bottom, area.bottom); }
      };
      // A fixed or absolute box escapes the overflow of ancestors outside its
      // containing block, so only ancestors on that chain clip it.
      const containsFixed = (style: CSSStyleDeclaration) =>
        style.transform !== "none" || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none" ||
        style.perspective !== "none" || style.filter !== "none" || style.backdropFilter !== "none" ||
        /paint|layout|strict|content/.test(style.contain) || /transform|translate|rotate|scale|perspective|filter/.test(style.willChange);
      let escaping: "fixed" | "absolute" | null = null;
      for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        const onChain = escaping === null
          || (escaping === "absolute" && (style.position !== "static" || containsFixed(style)))
          || (escaping === "fixed" && containsFixed(style));
        if (onChain) {
          escaping = null;
          if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth) { exempt = true; break; }
          const rect = node.getBoundingClientRect();
          cut(rect, style.overflowX !== "visible", style.overflowY !== "visible");
        }
        // `clip` and `clip-path` apply to the element itself, wherever it sits.
        const rect = node.getBoundingClientRect();
        const clipRect = /^rect\((.+)\)$/.exec(style.clip);
        if (clipRect) {
          const [t, r, b, l] = clipRect[1].split(/,?\s+/).map((v, i) => v === "auto" ? [0, rect.width, rect.height, 0][i] : parseFloat(v));
          cut({ left: rect.left + l, right: rect.left + r, top: rect.top + t, bottom: rect.top + b }, true, true);
        }
        const inset = /^inset\(([^)]*?)(?:\s+round[^)]*)?\)$/.exec(style.clipPath);
        if (inset) {
          // Expand the shorthand first: a percentage is of the width for left and right, the height for top and bottom.
          const [t0, r0 = t0, b0 = t0, l0 = r0] = inset[1].trim().split(/\s+/);
          const length = (part: string, of: number) => part.endsWith("%") ? parseFloat(part) / 100 * of : parseFloat(part);
          const [t, r, b, l] = [length(t0, rect.height), length(r0, rect.width), length(b0, rect.height), length(l0, rect.width)];
          cut({ left: rect.left + l, right: rect.right - r, top: rect.top + t, bottom: rect.bottom - b }, true, true);
        } else if (style.clipPath !== "none") {
          cut(rect, true, true);
        }
        if (style.position === "fixed") escaping = "fixed";
        else if (style.position === "absolute" && escaping === null) escaping = "absolute";
      }
      if (exempt || right - left < 1 || bottom - top < 1) continue;
      // Cut short by its own box inside the screen, like an ellipsis on a
      // long motion: shortened on purpose, not running off the screen.
      const reachesEdge = (box.right > width + 1 && right >= width - 1) || (box.left < -1 && left <= 1);
      if (!reachesEdge) continue;
      found.push(`${el.tagName.toLowerCase()} "${text.textContent.trim().slice(0, 60)}" spans ${Math.round(box.left)}-${Math.round(box.right)}px of ${width}px`);
    }
    return found;
  });
}

/**
 * Fails the test on any request to a hosted Supabase project, anything the
 * page logged as an error (see `pageErrors`), a page wider than its viewport,
 * and text past the screen edge, checked after the test body on whatever page
 * it ended.
 */
async function guarded(browser: Browser, body: () => Promise<void>) {
  const remote: string[] = [];
  await browser.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    remote.push(route.request.url);
    await route.abort();
  });
  await body();
  expect(await pageErrors(browser), "errors the page logged").toEqual([]);
  const overflow = await browser.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal page overflow in px").toBeLessThanOrEqual(1);
  expect(await textPastTheEdge(browser), "text running past the screen edge").toEqual([]);
  expect(remote, "requests to a hosted Supabase project").toEqual([]);
}

/**
 * A `test` whose `student` fixture is a fresh demo-code user (Pro, daily limit
 * 999, no Current Debate), signed in and deleted afterwards, under `guarded`.
 */
function studentTest(options: StudentOptions = {}) {
  const language = options.language ?? "en";
  return base.extend<{ student: Student }>({
    student: async ({ app, screen, browser }, provide) => {
      const user = await createDemoUser(`agentic-${language}`);
      try {
        await guarded(browser, async () => {
          await app.open("/login");
          await seedClientState(browser, options);
          await browser.reload();
          await signIn(screen, browser, user.code, language);
          await provide(user);
        });
      } finally {
        await deleteDemoUser(user);
      }
    },
  });
}

/**
 * A signed-out visitor using the given interface language, under `guarded`.
 * The `visitor` fixture opens a path with that language seeded.
 */
export function visitorTest(language: Language) {
  return base.extend<{ visitor: { open: (path: string) => Promise<void> } }>({
    visitor: async ({ app, browser }, provide) => {
      await guarded(browser, async () => {
        await provide({
          open: async (path) => {
            await app.open(path);
            await seedClientState(browser, { language });
            await browser.reload();
          },
        });
      });
    },
  });
}

/** A signed-in student who has already seen the onboarding tour. */
export const test = studentTest();
/** A brand-new account: the onboarding tour starts on /app. */
export const firstRunTest = studentTest({ tour: true });
/** A signed-in student using the Hungarian interface. */
export const hungarianTest = studentTest({ language: "hu" });
/** A signed-in student using the given interface language. */
export const localeTest = (language: Language) => studentTest({ language });

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

/**
 * A model answer on screen. In fake mode every answer carries the provider's
 * marker; live answers vary, so live tests add a judgment instead.
 */
export function fakeAnswer(screen: Screen) {
  return screen.getByText(new RegExp(MARK)).first();
}

/** The `ai_requests` rows a user owns, oldest first, as `feature: status`. */
export async function aiRequestsOf(student: Student) {
  const { data, error } = await admin.from("ai_requests").select("feature, status").eq("user_id", await student.userId()).order("created_at");
  if (error) throw error;
  return data.map((row) => `${row.feature}: ${row.status}`);
}
