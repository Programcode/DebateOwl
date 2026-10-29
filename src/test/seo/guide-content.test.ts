import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The generated guides in public/<slug>/index.html (scripts/generate_seo_content.py),
// which the build copies to dist/ unchanged. A guide is a page with a short-answer box.
const PUBLIC = resolve(process.cwd(), "public");
const guides = readdirSync(PUBLIC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      const html = readFileSync(resolve(PUBLIC, entry.name, "index.html"), "utf8");
      return html.includes('class="answer"') ? [{ slug: entry.name, html }] : [];
    } catch {
      return [];
    }
  });

// Pages whose length is set by facts we can state, not by copy we can add: padding a
// competitor comparison or the pricing page would mean inventing claims.
const SHORT_BY_DESIGN = new Set(["debateowl-pricing", "debateowl-vs-debateclub", "debateowl-vs-windebate"]);
const MIN_WORDS = 700;
const SHARED_SENTENCE_LENGTH = 60;
const MAX_PAGES_PER_SENTENCE = 3;

function decode(text: string): string {
  return text
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Visible text of <main> without the breadcrumb and related links, and optionally without the About aside. */
function mainText(html: string, { withAbout }: { withAbout: boolean }): string {
  let main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "";
  main = main
    .replace(/<nav class="breadcrumb"[\s\S]*?<\/nav>/, " ")
    .replace(/<section[^>]*aria-labelledby="related"[\s\S]*?<\/section>/, " ");
  if (!withAbout) main = main.replace(/<aside[^>]*aria-labelledby="about"[\s\S]*?<\/aside>/, " ");
  // A block element ends a sentence even when its text has no full stop.
  main = main.replace(/<\/(p|li|h\d|summary|td|th|div)>/g, ". ");
  return decode(main.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

const wordCount = (text: string) => text.match(/[A-Za-z0-9][\w'’-]*/g)?.length ?? 0;

// Required, word for word, on the comparison pages. The duplicate-sentence check
// still applies to every other line.
const ALLOWED_REPEATS = new Set([
  "The DebateOwl app has no free plan (3-day free trial, then $5/month); the separate tools at /tools are free with no account",
  "Facts about other products come from their own websites, checked on October 29, 2026",
  "By the DebateOwl team · Published October 29, 2026 · Last updated October 29, 2026",
]);

describe("generated guide pages", () => {
  it("finds the guides", () => {
    expect(guides.length).toBeGreaterThan(20);
  });

  it("gives every guide at least 700 words of its own outside the related and about blocks", () => {
    const short = guides
      .filter(({ slug }) => !SHORT_BY_DESIGN.has(slug))
      .map(({ slug, html }) => ({ slug, words: wordCount(mainText(html, { withAbout: false })) }))
      .filter(({ words }) => words < MIN_WORDS);
    expect(short).toEqual([]);
  });

  it("does not repeat a sentence longer than 60 characters on more than three guides", () => {
    const pagesBySentence = new Map<string, Set<string>>();
    for (const { slug, html } of guides) {
      for (const raw of mainText(html, { withAbout: true }).split(/(?<=[.!?])\s+/)) {
        const sentence = raw.replace(/^[\s.]+|[\s.]+$/g, "");
        if (sentence.length <= SHARED_SENTENCE_LENGTH || ALLOWED_REPEATS.has(sentence)) continue;
        pagesBySentence.set(sentence, (pagesBySentence.get(sentence) ?? new Set()).add(slug));
      }
    }
    const repeated = [...pagesBySentence].filter(([, pages]) => pages.size > MAX_PAGES_PER_SENTENCE).map(([sentence, pages]) => `${pages.size}x ${sentence}`);
    expect(repeated).toEqual([]);
  });
});
