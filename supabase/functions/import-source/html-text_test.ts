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

Deno.test("Wikipedia chrome, menus and CSS stay out of the article text", () => {
  const article = "Debate is a structured exchange of arguments about a resolution. " +
    "Competitors speak for and against the motion under timed speeches. ".repeat(8);
  const css = ".mw-parser-output{font-size:1em} " + ".mw-parser-output a{color:blue} ".repeat(40);
  const html = `<!DOCTYPE html><html><body>
    <header><button>Toggle the table of contents</button><a>Debate</a><button>62 languages</button></header>
    <nav id="p-lang" class="vector-menu-content"><ul><li class="interlanguage-link">Deutsch</li><li>Español</li></ul></nav>
    <main id="content">
      <div id="mw-content-text" class="mw-body-content">
        <div class="mw-parser-output">
          <style>${css}</style>
          <div id="toc" class="toc"><div class="toctitle">Contents</div><ul><li>History</li></ul></div>
          <p>${article}</p>
          <h2>History <span class="mw-editsection"><a href="/w/index.php?title=Debate&amp;action=edit">edit</a></span></h2>
          <p>${article}</p>
          <table class="navbox"><tr><td>Debate series · Related pages · Categories</td></tr></table>
        </div>
      </div>
    </main>
  </body></html>`;
  const text = stripHtml(html);
  if (text.includes("Toggle the table of contents")) throw new Error("table of contents toggle leaked");
  if (text.includes("62 languages") || text.includes("Deutsch") || text.includes("Español")) {
    throw new Error(`language list leaked: ${text.slice(0, 240)}`);
  }
  if (text.includes("[ edit ]") || text.includes(" edit") || /\bedit\b/.test(text)) throw new Error("edit link leaked");
  if (text.includes("mw-parser-output") || text.includes("font-size")) throw new Error("CSS leaked");
  if (text.includes("navbox") || text.includes("Related pages")) throw new Error("navbox leaked");
  if (text.includes("Contents") && text.includes("History") && !text.includes("structured exchange")) {
    throw new Error("table of contents leaked");
  }
  if (!text.includes("structured exchange")) throw new Error("article text was dropped");
});

Deno.test("text after the last > is kept, with no tag parsing", () => {
  const html = `<p>${"word ".repeat(25)}</p> 3 < 5 and more words here`;
  assertEquals(stripHtml(html).includes("3 < 5 and more words here"), true);
});

Deno.test("a real Wikipedia page keeps its article text and drops the chrome", async () => {
  // en.wikipedia.org/wiki/Free_public_transport as served on 2026-10-22 (CC BY-SA 4.0), gzipped.
  // Its <html> carries `vector-toc-available` and `vector-feature-toc-pinned-*`, which once
  // matched the `toc` chrome rule and stripped the whole page.
  const gz = await Deno.readFile(new URL("./testdata/wikipedia-free-public-transport.html.gz", import.meta.url));
  const html = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  const text = stripHtml(html);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 1_000) throw new Error(`expected the article body, got ${words} words`);
  assertEquals(/free public transport/i.test(text.slice(0, 600)), true);
  assertEquals(text.includes("Toggle the table of contents"), false);
  assertEquals(text.includes("[edit]"), false);
  assertEquals(text.includes("Asturianu"), false);
});

Deno.test("chrome rules match whole class tokens, not fragments of page flags", () => {
  const body = "Free fares raised ridership in Tallinn and cut car trips in the city centre. ".repeat(6);
  const html = `<html class="vector-toc-available vector-feature-toc-pinned-clientpref-1 noprint-flag">` +
    `<body class="skin-vector-2022"><div id="toc" class="toc">Contents 1 History</div>` +
    `<div class="mw-body vector-toc-landmark"><p>${body}</p></div></body></html>`;
  const text = stripHtml(html);
  assertEquals(text.includes("Free fares raised ridership"), true);
  assertEquals(text.includes("Contents 1 History"), false);
});
