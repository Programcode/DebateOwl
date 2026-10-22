// HTML cleanup for URL import. Tag removal is a single forward scan: the old
// regular expressions retried unclosed `<meta` and `<nav` until the import
// timed out, and an out-of-range numeric entity threw before any text was saved.

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
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf("<meta", i);
    if (start === -1) return undefined;
    const next = lower[start + 5];
    if (next && /[a-z0-9]/.test(next)) {
      i = start + 5;
      continue;
    }
    const end = html.indexOf(">", start);
    // An unclosed tag is skipped in one step. Searching it with a regex retried the whole page.
    if (end === -1 || end - start > 4000) {
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

function shouldStrip(name: string, tag: string): boolean {
  if (STRIP_TAGS.has(name)) return true;
  if (name !== "div" && name !== "section") return false;
  const role = readAttr(tag, "role")?.toLowerCase();
  if (role && ROLE_STRIP.has(role)) return true;
  const idClass = `${readAttr(tag, "id") || ""} ${readAttr(tag, "class") || ""}`;
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
  let depth = 1;
  let i = from;
  while (depth > 0) {
    const nextOpen = lower.indexOf(openNeedle, i);
    const nextClose = lower.indexOf(closeNeedle, i);
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

export function stripHtml(html: string): string {
  const lower = html.toLowerCase();
  const absentAfter = new Map<string, number>();
  const candidates: string[] = [];
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
    const end = html.indexOf(">", start + 1);
    if (end === -1 || end - start > 8000) {
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
      if (close !== -1) candidates.push(html.slice(end + 1, close));
    }
    cleaned += tag;
    i = end + 1;
  }

  const textCandidates = [...candidates, cleaned]
    .map((candidate) => htmlToText(candidate))
    .filter((text) => text.split(/\s+/).filter(Boolean).length >= 20);
  return textCandidates.sort((a, b) => scoreReadableText(b) - scoreReadableText(a))[0] || htmlToText(cleaned);
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
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
