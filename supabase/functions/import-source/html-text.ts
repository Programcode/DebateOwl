// HTML cleanup for URL import. Tag removal is a single forward scan: the old
// regular expressions retried unclosed `<meta` and `<nav` until the import
// timed out, and an out-of-range numeric entity threw before any text was saved.
// Every search below remembers where it last found its needle and only searches
// again once the scan has passed that point, so hostile pages (thousands of
// unclosed tags, a stray `<` with no `>`) stay linear in the page size.

/** indexOf for a forward scan: repeated calls with growing `from` cost O(n) in total. */
function forwardFinder(haystack: string, needle: string): (from: number) => number {
  let found = -2; // -2: not searched yet; -1: absent from `searchedFrom` on
  let searchedFrom = 0;
  return (from: number) => {
    if (found === -1 && from >= searchedFrom) return -1;
    if (found >= from && from >= searchedFrom) return found;
    searchedFrom = from;
    found = haystack.indexOf(needle, from);
    return found;
  };
}

const STRIP_TAGS = new Set([
  "script", "style", "template", "noscript", "nav", "footer", "header", "aside", "form", "svg", "iframe", "button",
]);
const ROLE_STRIP = new Set(["banner", "navigation", "complementary", "search", "contentinfo"]);
const CLASS_HINT = /(?:^|[\s_-])(?:cookie|consent|banner|navbar|navigation|nav|menu|sidebar|header|footer|subscribe|newsletter|social|share|paywall)(?:$|[\s_-])/i;
const CONTENT_HINT = /(?:^|[\s_-])(?:article|content|story|post|entry|main|body|reader)(?:$|[\s_-])/i;
const CONTENT_TAGS = new Set(["article", "main", "section", "div"]);

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCodePoint(hex, 16))
    .replace(/&#(\d+);/g, (_, dec: string) => fromCodePoint(dec, 10));
}

function fromCodePoint(raw: string, radix: number): string {
  const code = parseInt(raw, radix);
  // Surrogates and values past Unicode's last code point throw from fromCodePoint.
  if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return "";
  return String.fromCodePoint(code);
}

function readAttr(tag: string, attr: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2];
}

function parseOpenTag(tag: string): { name: string; closing: boolean; selfClosing: boolean } | null {
  const match = /^<\s*(\/)?\s*([a-zA-Z][\w:-]*)/.exec(tag);
  if (!match) return null;
  return {
    name: match[2].toLowerCase(),
    closing: Boolean(match[1]),
    selfClosing: /\/\s*>$/.test(tag),
  };
}

export function getMeta(html: string, names: string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lower = html.toLowerCase();
  const nextMeta = forwardFinder(lower, "<meta");
  const nextGt = forwardFinder(html, ">");
  let i = 0;
  while (i < html.length) {
    const start = nextMeta(i);
    if (start === -1) return undefined;
    const next = lower[start + 5];
    if (next && /[a-z0-9]/.test(next)) {
      i = start + 5;
      continue;
    }
    const end = nextGt(start);
    // No `>` left means no complete tag left.
    if (end === -1) return undefined;
    // An overlong tag is skipped in one step. Searching it with a regex retried the whole page.
    if (end - start > 4000) {
      i = start + 5;
      continue;
    }
    const tag = html.slice(start, end + 1);
    const name = (readAttr(tag, "property") || readAttr(tag, "name") || "").toLowerCase();
    const content = readAttr(tag, "content");
    if (name && content !== undefined && wanted.has(name)) return decodeEntities(content.trim());
    i = end + 1;
  }
  return undefined;
}

export function getTitle(html: string, fallback: string): string {
  const meta = getMeta(html, ["og:title", "twitter:title"]);
  if (meta) return meta;
  const lower = html.toLowerCase();
  const start = lower.indexOf("<title");
  if (start === -1) return fallback;
  const openEnd = html.indexOf(">", start);
  const close = openEnd === -1 ? -1 : lower.indexOf("</title>", openEnd);
  if (openEnd === -1 || close === -1 || close - openEnd > 2000) return fallback;
  const text = decodeEntities(html.slice(openEnd + 1, close).replace(/\s+/g, " ").trim());
  return text || fallback;
}

// Article roots we would rather keep. Everything else that looks like Wikipedia
// chrome (edit links, the table of contents, navboxes, language lists) is dropped
// before its text can reach the importer.
const ARTICLE_ROOT = /(?:^|[\s_-])(?:mw-content-text|mw-parser-output)(?:$|[\s_-])/i;
const WIKI_CHROME = /(?:^|[\s_-])(?:mw-editsection|mw-editsection-like|toc|navbox|interlanguage|vector-language|mw-portlet-lang|p-lang|sistersitebox|noprint|mw-jump-link|vector-page-toolbar|vector-sticky-header|vector-toc)(?:$|[\s_-])/i;

function idClassOf(tag: string): string {
  return `${readAttr(tag, "id") || ""} ${readAttr(tag, "class") || ""}`;
}

function isArticleRoot(name: string, idClass: string): boolean {
  return name === "main" || name === "article" || ARTICLE_ROOT.test(idClass);
}

function shouldStrip(name: string, tag: string): boolean {
  if (STRIP_TAGS.has(name)) return true;
  const idClass = idClassOf(tag);
  if (isArticleRoot(name, idClass)) return false;
  if (WIKI_CHROME.test(idClass)) return true;
  if (name !== "div" && name !== "section") return false;
  const role = readAttr(tag, "role")?.toLowerCase();
  if (role && ROLE_STRIP.has(role)) return true;
  return CLASS_HINT.test(idClass);
}

function isContentBlock(name: string, tag: string): boolean {
  if (!CONTENT_TAGS.has(name)) return false;
  if (name === "article" || name === "main") return true;
  const idClass = `${readAttr(tag, "id") || ""} ${readAttr(tag, "class") || ""}`;
  return CONTENT_HINT.test(idClass);
}

/** Index just after the matching close tag, or -1 when this element is never closed. */
function matchingClose(html: string, lower: string, tag: string, from: number, absentAfter: Map<string, number>): number {
  const known = absentAfter.get(tag);
  if (known !== undefined && from >= known) return -1;
  const openNeedle = `<${tag}`;
  const closeNeedle = `</${tag}`;
  // Each needle is searched once per occurrence, not once per nesting level:
  // re-running indexOf for the far close tag at every level was quadratic.
  const findOpen = forwardFinder(lower, openNeedle);
  const findClose = forwardFinder(lower, closeNeedle);
  let depth = 1;
  let i = from;
  while (depth > 0) {
    const nextOpen = findOpen(i);
    const nextClose = findClose(i);
    if (nextClose === -1) {
      absentAfter.set(tag, from);
      return -1;
    }
    const openIsTag = nextOpen !== -1 && !/[a-z0-9]/i.test(lower[nextOpen + openNeedle.length] || "");
    if (openIsTag && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + openNeedle.length;
      continue;
    }
    depth -= 1;
    i = nextClose + closeNeedle.length;
  }
  const end = html.indexOf(">", i - closeNeedle.length);
  return end === -1 ? html.length : end + 1;
}

type ContentCandidate = { html: string; preferred: boolean };

/**
 * One forward pass. `cleaned` has chrome elements removed. `candidates` are the
 * raw insides of article roots, still containing nested chrome: the caller runs
 * this pass again on each candidate before turning it into text.
 */
function collectContent(html: string): { cleaned: string; candidates: ContentCandidate[] } {
  const lower = html.toLowerCase();
  const absentAfter = new Map<string, number>();
  const candidates: ContentCandidate[] = [];
  const nextGt = forwardFinder(html, ">");
  let cleaned = "";
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf("<", i);
    if (start === -1) {
      cleaned += html.slice(i);
      break;
    }
    cleaned += html.slice(i, start);
    if (lower.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      cleaned += " ";
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const end = nextGt(start + 1);
    if (end === -1) {
      // No `>` left, so nothing after this point can be a tag.
      cleaned += html.slice(start);
      break;
    }
    if (end - start > 8000) {
      cleaned += "<";
      i = start + 1;
      continue;
    }
    const tag = html.slice(start, end + 1);
    const parsed = parseOpenTag(tag);
    if (!parsed || parsed.closing || parsed.selfClosing) {
      cleaned += tag;
      i = end + 1;
      continue;
    }
    if (shouldStrip(parsed.name, tag)) {
      const close = matchingClose(html, lower, parsed.name, end + 1, absentAfter);
      cleaned += " ";
      i = close === -1 ? end + 1 : close;
      continue;
    }
    if (isContentBlock(parsed.name, tag) && candidates.length < 8) {
      const close = matchingClose(html, lower, parsed.name, end + 1, absentAfter);
      if (close !== -1) {
        const idClass = idClassOf(tag);
        candidates.push({
          html: html.slice(end + 1, close),
          preferred: parsed.name === "main" || parsed.name === "article" || ARTICLE_ROOT.test(idClass),
        });
      }
    }
    cleaned += tag;
    i = end + 1;
  }

  return { cleaned, candidates };
}

export function stripHtml(html: string): string {
  const { cleaned, candidates } = collectContent(html);
  // The first pass records article HTML before nested style, nav and edit
  // links are removed. Strip that chrome, then prefer the article root.
  const texts = [
    ...candidates.map((candidate) => ({
      text: htmlToText(collectContent(candidate.html).cleaned),
      preferred: candidate.preferred,
    })),
    { text: htmlToText(cleaned), preferred: false },
  ].filter((item) => item.text.split(/\s+/).filter(Boolean).length >= 20);
  texts.sort((a, b) => {
    const bonus = (item: { preferred: boolean }) => item.preferred ? 10_000 : 0;
    return scoreReadableText(b.text) + bonus(b) - (scoreReadableText(a.text) + bonus(a));
  });
  return texts[0]?.text || htmlToText(cleaned);
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // `[^<>]` keeps each attempt from rescanning to the end of a page full of stray `<`.
    .replace(/<[^<>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function scoreReadableText(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().split(/\s+/).length >= 12).length;
  const punctuation = (text.match(/[.!?]/g) || []).length;
  const navPenalty = (text.match(/\b(cookie|subscribe|sign in|advertisement|privacy policy|all rights reserved)\b/gi) || []).length * 30;
  return words + paragraphs * 80 + punctuation * 4 - navPenalty;
}
