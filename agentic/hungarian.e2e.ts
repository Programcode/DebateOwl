import { agentic, expect, hungarianTest as test } from "./support/fixtures";

// e2e/hungarian-parity.spec.ts checks lang, headings and chosen labels, and by
// design cannot reject stray English. A judge reading each screen can.
const PAGES = ["/app", "/app/generate", "/app/brainstorm", "/app/sparring", "/app/library", "/app/history", "/app/settings"];

for (const path of PAGES) {
  test(`${path} reads in Hungarian and fits the screen`, agentic, async ({ app, agent, browser }) => {
    await app.open(path);
    await expect(browser.locator("html")).toHaveAttribute("lang", "hu");
    await expect(browser.locator("main h1, main h2").first()).toBeVisible();
    await agent.assert(
      "Every piece of interface text on this screen (navigation, headings, buttons, field labels, placeholders, hints and empty states) is in Hungarian. Product names such as DebateLab, AI model names (Claude Sonnet 5) and plan names (Pro), debate format codes, language names offered as choices (English, Español, Magyar), and user content do not count. An English loanword inflected with a Hungarian ending, such as \"coachingot\", is Hungarian.",
      { vision: true },
    );
    await agent.assert(
      "No label, heading, button, navigation or message text on this screen is cut off, overlapping other text, or running past the edge of its button or the screen. A placeholder or value that scrolls inside a text field is normal and does not count.",
      { vision: "only" },
    );
  });
}
