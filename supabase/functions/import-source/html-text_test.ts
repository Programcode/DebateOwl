import { assertEquals } from "jsr:@std/assert@1.0.19";
import { decodeEntities, getMeta, getTitle, stripHtml } from "./html-text.ts";

Deno.test("out-of-range numeric entities do not crash the import", () => {
  const html = `<article><p>${"word ".repeat(30)}&#99999999; &#x110000; &#xD800; &#38; more.</p></article>`;
  const text = stripHtml(html);
  assertEquals(text.includes("Invalid code point"), false);
  assertEquals(text.includes("&"), true);
  assertEquals(decodeEntities("&#99999999;"), "");
  assertEquals(decodeEntities("&#38;"), "&");
  assertEquals(decodeEntities("caf&#233;"), "café");
});

Deno.test("article text is kept and a closed nav is dropped", () => {
  const words = "Public transport is cheaper than driving for most students in cities.";
  const html = `<nav><a>Home</a><a>Sign in</a></nav><article><p>${words} ${words}</p></article>`;
  const text = stripHtml(html);
  assertEquals(text.includes("Public transport"), true);
  assertEquals(text.includes("Home"), false);
});

Deno.test("meta titles are read without retrying an unclosed tag", () => {
  const hostile = "<meta name='og:title' ".repeat(8000);
  const started = Date.now();
  assertEquals(getMeta(hostile, ["og:title"]), undefined);
  assertEquals(getTitle(`${hostile}<title>Voting age</title>`, "fallback"), "Voting age");
  const closed = `<meta property="og:title" content="Free buses &amp; trains">`;
  assertEquals(getMeta(closed, ["og:title"]), "Free buses & trains");
  if (Date.now() - started > 500) throw new Error("unclosed meta tags took too long");
});

Deno.test("a long run of unclosed nav tags stays fast", () => {
  const html = "<nav class='menu'>".repeat(4000) + `<article><p>${"evidence ".repeat(40)}</p></article>`;
  const started = Date.now();
  const text = stripHtml(html);
  if (Date.now() - started > 500) throw new Error("unclosed nav tags took too long");
  assertEquals(text.includes("evidence"), true);
});

// Pages up to the 1 MB import limit. Each case was quadratic in an earlier
// version and took from seconds to many minutes at this size; linear code
// takes well under 200 ms. The budget is loose so a busy machine does not flake.
const PAGE = 1_000_000;
const BUDGET_MS = 1500;
const hostilePages: Record<string, string> = {
  "unclosed nav tags with one far close": "<nav>".repeat(PAGE / 5) + "</nav>",
  "stray < with no >": "<".repeat(PAGE),
  "unclosed meta tags with no >": "<meta ".repeat(PAGE / 6),
  "text full of '< a'": "< a ".repeat(PAGE / 4),
  "overlong tags": ("<" + "a".repeat(9000)).repeat(Math.ceil(PAGE / 9001)) + ">",
};
for (const [name, html] of Object.entries(hostilePages)) {
  Deno.test(`a 1 MB page of ${name} is parsed in linear time`, () => {
    const started = performance.now();
    stripHtml(html);
    getTitle(html, "fallback");
    getMeta(html, ["author"]);
    const elapsed = performance.now() - started;
    if (elapsed > BUDGET_MS) throw new Error(`${name}: ${Math.round(elapsed)} ms`);
  });
}

Deno.test("a nested nav is dropped whole and the article survives the speed-ups", () => {
  const words = "Lowering the voting age raises turnout among first-time voters.";
  const html = `<nav><ul><li><nav>Inner</nav></li></ul>Outer</nav><article><p>${words} ${words} ${words}</p></article>`;
  const text = stripHtml(html);
  assertEquals(text.includes("Inner"), false);
  assertEquals(text.includes("Outer"), false);
  assertEquals(text.includes("voting age"), true);
});

Deno.test("text after the last > is kept, with no tag parsing", () => {
  const html = `<p>${"word ".repeat(25)}</p> 3 < 5 and more words here`;
  assertEquals(stripHtml(html).includes("3 < 5 and more words here"), true);
});
