import { agentic, expect, hungarianTest as test } from "./support/fixtures";

// e2e/hungarian-parity.spec.ts checks lang, headings and chosen labels, and by
// design cannot reject stray English. A judge reading each screen can.
const PAGES = ["/app", "/app/generate", "/app/brainstorm", "/app/sparring", "/app/library", "/app/history", "/app/settings"];

test("main pages read in Hungarian and fit the screen", agentic, async ({ app, agent, browser }) => {
  for (const path of PAGES) {
    await app.open(path);
    await expect(browser.locator("html")).toHaveAttribute("lang", "hu");
    await expect(browser.locator("main h1, main h2").first()).toBeVisible();
    await agent.assert(
      `On ${path}, every piece of interface text (navigation, headings, buttons, field labels, placeholders, hints and empty states) is in Hungarian. Product names such as DebateLab, debate format codes, and user content do not count.`,
      { vision: true },
    );
    await agent.assert(
      `On ${path}, no interface text is cut off, overlapping other text, or running past the edge of its button or the screen.`,
      { vision: "only" },
    );
  }
});
