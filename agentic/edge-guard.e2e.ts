import { test } from "@e2e-dev/web";
import { agentic, expect, textPastTheEdge } from "./support/fixtures";

// The rules of the fixtures' text-past-the-edge guard, on injected layouts:
// text that shows up to the screen edge and continues fails; text clipped
// away, cut short inside the screen, or in a sideways scroller does not.
// Each layout puts text across the screen edge before clipping, so a case
// passes only through the rule it names.
const LONG = "Long words past the edge ".repeat(30);
const CASES: [string, string, boolean][] = [
  ["nowrap text clipped by an overflow-hidden box at the edge", `<div style="overflow:hidden;width:100vw"><p style="white-space:nowrap;width:100%">${LONG}</p></div>`, true],
  ["text overflowing the page with no clip", `<p style="white-space:nowrap;position:relative;left:200px">${LONG}</p>`, true],
  ["hero column wider than the screen", `<div style="overflow-x:hidden"><div style="width:calc(100vw + 120px);margin-left:16px"><p>${"A paragraph of wrapping words ".repeat(20)}</p></div></div>`, true],
  ["clip-path box wider than the screen", `<div style="width:calc(100vw + 200px);clip-path:inset(0)"><h2 style="white-space:nowrap;margin-left:calc(100vw - 30px)">A heading past the edge</h2></div>`, true],
  ["one-axis clip leaves the other axis visible", `<div style="width:100px;overflow-x:visible;overflow-y:clip"><h2 style="white-space:nowrap;margin-left:calc(100vw - 30px)">A heading past the edge</h2></div>`, true],
  ["fixed text escapes a clipping ancestor outside its containing block", `<div style="overflow:hidden;width:200px"><h2 style="position:fixed;top:0;left:calc(100vw - 30px);white-space:nowrap">A fixed heading past the edge</h2></div>`, true],
  ["fixed text inside a transformed clipping ancestor", `<div style="overflow:hidden;width:200px;height:100px;transform:translateZ(0)"><h2 style="position:fixed;top:0;left:calc(100vw - 30px);white-space:nowrap">A fixed heading past the edge</h2></div>`, false],
  ["one-value percentage inset leaves the edge visible", `<div style="overflow-x:hidden"><div style="position:relative;width:calc(100vw + 200px);height:3000px;clip-path:inset(10%)"><p style="position:absolute;left:calc(100vw - 30px);top:400px;white-space:nowrap">${LONG}</p></div></div>`, true],
  ["fixed text inside a backdrop-filter clipping ancestor", `<div style="overflow:hidden;width:200px;height:100px;backdrop-filter:blur(0px)"><h2 style="position:fixed;top:0;left:calc(100vw - 30px);white-space:nowrap">A fixed heading past the edge</h2></div>`, false],
  ["ellipsis inside a header", `<header style="display:flex;width:100%"><span style="margin-left:152px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${LONG}</span></header>`, false],
  ["wide box holding short text", `<div style="overflow:hidden"><p style="width:calc(100vw + 200px)">Hello</p></div>`, false],
  ["node panned out of a clipped canvas", `<div style="overflow:hidden;width:200px;height:200px;position:relative"><div style="position:absolute;left:calc(100vw - 30px);top:10px;white-space:nowrap">${LONG}</div></div>`, false],
  ["drawer translated off canvas", `<div style="position:fixed;top:0;left:0;transform:translateX(-100%);width:300px;overflow:hidden;white-space:nowrap">${LONG}</div>`, false],
  ["zero-area clip label", `<span style="position:absolute;left:calc(100vw - 30px);clip:rect(0px,0px,0px,0px);white-space:nowrap">${LONG}</span>`, false],
  ["zero-height clip with a width", `<span style="position:absolute;left:calc(100vw - 30px);clip:rect(0px,100px,0px,0px);white-space:nowrap">${LONG}</span>`, false],
  ["clip-path that hides the whole box", `<p style="white-space:nowrap;margin-left:calc(100vw - 30px);clip-path:inset(0 100% 0 0)">${LONG}</p>`, false],
  ["table that scrolls sideways", `<div style="overflow-x:auto;width:300px"><p style="white-space:nowrap">${LONG}</p></div>`, false],
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
