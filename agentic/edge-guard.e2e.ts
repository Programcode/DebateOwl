import { test } from "@e2e-dev/web";
import { agentic, expect, textPastTheEdge } from "./support/fixtures";

// The rules of the fixtures' text-past-the-edge guard, on injected layouts:
// text that shows up to the screen edge and continues fails; text clipped
// away, cut short inside the screen, or in a sideways scroller does not.
const CASES: [string, string, boolean][] = [
  ["nowrap text clipped by an overflow-hidden box at the edge", `<div style="overflow:hidden;width:100vw"><p style="white-space:nowrap;width:100%">${"Clipped words ".repeat(40)}</p></div>`, true],
  ["text overflowing the page with no clip", `<p style="white-space:nowrap;position:relative;left:200px">${"Overflowing words ".repeat(20)}</p>`, true],
  ["hero column wider than the screen", `<div style="overflow-x:hidden"><div style="width:calc(100vw + 120px);margin-left:16px"><p>${"A paragraph of wrapping words ".repeat(20)}</p></div></div>`, true],
  ["clip-path box wider than the screen", `<div style="width:calc(100vw + 200px);clip-path:inset(0)"><h2 style="white-space:nowrap;margin-left:calc(100vw - 30px)">A heading past the edge</h2></div>`, true],
  ["one-axis clip leaves the other axis visible", `<div style="width:100px;overflow-x:visible;overflow-y:clip"><h2 style="white-space:nowrap;margin-left:calc(100vw - 30px)">A heading past the edge</h2></div>`, true],
  ["ellipsis inside a header", `<header style="display:flex;width:100%"><span style="margin-left:152px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">This House would replace school exams with continuous assessment</span></header>`, false],
  ["wide box holding short text", `<div style="overflow:hidden"><p style="width:600px">Hello</p></div>`, false],
  ["node panned fully outside a clipped canvas", `<div style="overflow:hidden;width:200px;height:200px;position:relative"><div style="position:absolute;left:900px;top:10px">Panned node</div></div>`, false],
  ["drawer translated off canvas", `<div style="position:fixed;top:0;left:0;transform:translateX(-100%);width:300px">Drawer link</div>`, false],
  ["sr-only label", `<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Screen reader text that is long</span>`, false],
  ["table that scrolls sideways", `<div style="overflow-x:auto;width:300px"><p style="white-space:nowrap">${"Wide table cell ".repeat(40)}</p></div>`, false],
];
for (const [name, html, expectFlag] of CASES) {
  test(`edge guard: ${name}`, { skip: agentic.skip, tags: ["guards"] }, async ({ app, browser }) => {
    await app.open("/privacy");
    await expect(browser.locator("h1").first()).toBeVisible();
    await browser.evaluate((h: string) => { document.body.innerHTML = `<main>${h}</main>`; return null; }, html);
    const found = await textPastTheEdge(browser);
    expect(found.length > 0, JSON.stringify(found)).toBe(expectFlag);
  });
}
