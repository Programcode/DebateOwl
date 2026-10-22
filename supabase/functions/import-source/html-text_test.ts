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
