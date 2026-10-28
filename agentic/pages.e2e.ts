import type { Browser } from "@e2e-dev/web";
import type { Agent } from "e2e";
import { agentic, expect, LANGUAGES, localeTest, visitorTest, type Language } from "./support/fixtures";

// Every page a student or visitor reaches, in every interface language, on
// both viewports. Not covered: /app/admin (admins only) and /share/:code (no
// client code creates a share link yet). Selectors pin
// what they can (lang, a heading, no raw values); the judge reads the screen
// for what they cannot: stray untranslated text, error notices, and clipped
// or overlapping text. e2e/hungarian-parity.spec.ts and authed-pages.spec.ts
// render the same pages with a stubbed session and by design cannot judge copy.
const APP_PAGES = [
  "/app",
  "/app/debate",
  "/app/generate",
  "/app/attack",
  "/app/brainstorm",
  "/app/factoids",
  "/app/ask",
  "/app/sparring",
  "/app/crossfire",
  "/app/flowchart",
  "/app/timer",
  "/app/library",
  "/app/history",
  "/app/settings",
];
const PUBLIC_PAGES = ["/", "/login", "/terms", "/privacy", "/expocit/sources"];

const NAMES: Record<Language, string> = { en: "English", es: "Spanish", hu: "Hungarian" };

const EXEMPT =
  "Product names such as DebateOwl, DebateLab and ExpoCit, AI model names (Claude Sonnet 5), plan names (Pro), debate format codes and the competition format names kept in English in every language (Public Forum, Lincoln-Douglas, Policy, British Parliamentary, World Schools, Asian Parliamentary), language names offered as choices (English, Español, Magyar), and user content do not count. Technical loanwords the app uses on purpose, such as email, chat, prompt and token, count as translated.";

async function checkPage(browser: Browser, agent: Agent, language: Language) {
  await expect(browser.locator("html")).toHaveAttribute("lang", language);
  await expect(browser.locator("h1, h2, h3").first()).toBeVisible();
  // Values a broken render leaks into the page as text.
  await expect(browser.locator("body")).not.toContainText(/\[object Object\]|\bundefined\b|\bNaN\b/);

  const translated = language === "en" ? "" : ` Every piece of interface text (navigation, headings, buttons, field labels, placeholders, hints and empty states) is in ${NAMES[language]}. ${EXEMPT}`;
  await agent.assert(
    `The screen shows no error message, failed-to-load notice, or raw placeholder text such as a translation key (settings.title).${translated}`,
    { vision: true },
  );
  await agent.assert(
    "No label, heading, button, navigation or message text on this screen is cut off, overlapping other text, or running past the edge of its button or the screen. A placeholder or value that scrolls inside a text field, and an intentional ellipsis (…), are normal and do not count.",
    { vision: "only" },
  );
}

for (const language of LANGUAGES) {
  const test = localeTest(language);
  for (const path of APP_PAGES) {
    test(`${path} [${language}] reads correctly and fits the screen`, { ...agentic, tags: ["pages", language] }, async ({ app, agent, browser }) => {
      await app.open(path);
      await checkPage(browser, agent, language);
    });
  }

  const visitor = visitorTest(language);
  for (const path of PUBLIC_PAGES) {
    visitor(`${path} [${language}] reads correctly and fits the screen for a visitor`, { ...agentic, tags: ["pages", language] }, async ({ agent, browser, visitor }) => {
      await visitor.open(path);
      await checkPage(browser, agent, language);
    });
  }
}
