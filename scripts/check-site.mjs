// Runs after scripts/sitemap.mjs. Reads the built site in dist/ the way a
// crawler or answer engine would and fails the build on:
// - an internal link, sitemap URL or llms.txt URL that does not resolve to a
//   page, a vercel.json redirect to a page, or an app rewrite;
// - a #fragment that names no id on the target page;
// - JSON-LD that does not parse or carries HTML entities into its text;
// - an indexed page without its question H2 (#short-answer) as the first H2;
// - an image without alt text, a button without a name, or a form field without a label.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const SITE_ORIGIN = JSON.parse(readFileSync('src/config/site.json', 'utf8')).origin;
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
// Indexed pages that answer no question of their own.
const NO_SHORT_ANSWER = new Set(['/terms', '/privacy']);

const problems = [];
const report = (where, message) => problems.push(`${where}: ${message}`);

/** A vercel.json source such as /:page(a|b)/:rest+ as an exact-path RegExp. */
function sourcePattern(source) {
  const pattern = source
    .replace(/:\w+\(([^)]+)\)/g, '($1)')
    .replace(/:\w+\+/g, '.+')
    // /:path* also matches the bare prefix: /share/:path* covers /share.
    .replace(/\/:\w+\*/g, '(?:/.*)?')
    .replace(/:\w+\*/g, '.*');
  return new RegExp(`^${pattern}$`);
}
const redirects = vercel.redirects.map((rule) => ({ match: sourcePattern(rule.source), destination: rule.destination }));
const rewrites = vercel.rewrites.map((rule) => ({ match: sourcePattern(rule.source), destination: rule.destination }));

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'assets' || entry.name.startsWith('.') ? [] : htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function routeOf(file) {
  const parts = relative(DIST, file).split(sep);
  if (parts.at(-1) !== 'index.html') return `/${parts.join('/')}`;
  const folder = parts.slice(0, -1).join('/');
  return folder ? `/${folder}` : '/';
}

/** The file Vercel serves for a path, after at most a few redirects, or undefined. */
function resolvePath(path, hops = 0) {
  if (hops > 3) return undefined;
  // trailingSlash: false sends /page/ to /page first.
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const page = clean === '/' ? join(DIST, 'index.html') : join(DIST, clean, 'index.html');
  if (existsSync(page)) return page;
  const file = join(DIST, clean);
  if (clean !== '/' && existsSync(file) && statSync(file).isFile()) return file;
  const redirect = redirects.find((rule) => rule.match.test(clean));
  if (redirect) return resolvePath(redirect.destination, hops + 1);
  const rewrite = rewrites.find((rule) => rule.match.test(clean));
  if (rewrite) return join(DIST, rewrite.destination);
  return undefined;
}

const idsCache = new Map();
function idsIn(file) {
  if (!idsCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])));
  }
  return idsCache.get(file);
}

/** Checks one internal URL (path, optional fragment) found in `where`, relative to `fromFile`. */
function checkUrl(url, where, fromFile) {
  const parsed = new URL(url, `${SITE_ORIGIN}${fromFile ? routeOf(fromFile) : '/'}`);
  if (parsed.origin !== SITE_ORIGIN) return;
  const target = url.startsWith('#') ? fromFile : resolvePath(decodeURIComponent(parsed.pathname));
  if (!target || !existsSync(target)) {
    report(where, `${url} does not resolve to a page`);
    return;
  }
  const fragment = decodeURIComponent(parsed.hash.slice(1));
  if (fragment && target.endsWith('.html') && !target.endsWith('app-shell.html') && !idsIn(target).has(fragment)) {
    report(where, `${url} names #${fragment}, which ${relative(DIST, target)} does not have`);
  }
}

const textOf = (html) => html.replace(/<[^>]+>/g, '').replace(/&[#\w]+;/g, 'x').trim();

/** Whether attributes give an accessible name: aria-label, or aria-labelledby naming elements with text in `html`. */
function namedByAria(attributes, html) {
  if (/\saria-label="[^"]*\S[^"]*"/.test(attributes)) return true;
  const ids = attributes.match(/\saria-labelledby="([^"]+)"/)?.[1].trim().split(/\s+/);
  if (!ids) return false;
  return ids.every((id) => {
    const start = html.search(new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    if (start < 0) return false;
    const open = html.indexOf('>', start);
    return Boolean(textOf(html.slice(open + 1, html.indexOf('</', open))));
  });
}

for (const file of htmlFiles(DIST)) {
  const where = relative(DIST, file);
  const html = readFileSync(file, 'utf8');
  const body = html.slice(html.indexOf('<body'));

  for (const [, href] of body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    checkUrl(href.replaceAll('&amp;', '&'), where, file);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(json);
    } catch (error) {
      report(where, `JSON-LD does not parse: ${error.message}`);
    }
    if (/&(amp|lt|gt|quot|#x?[\da-f]+);/i.test(json)) report(where, 'JSON-LD text contains HTML entities');
  }

  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
  const indexed = !/noindex/i.test(robots) && html.includes('<link rel="canonical"');
  if (indexed && !NO_SHORT_ANSWER.has(routeOf(file))) {
    const firstH2 = body.match(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/);
    if (!firstH2 || !/\sid="short-answer"/.test(firstH2[1])) report(where, 'the first H2 is not the #short-answer question');
    else if (!textOf(firstH2[2]).endsWith('?')) report(where, 'the #short-answer H2 is not a question');
  }

  for (const [tag] of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(tag)) report(where, `image without alt text: ${tag.slice(0, 80)}`);
  }
  for (const [, attributes, content] of body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (!namedByAria(attributes, body) && !textOf(content)) report(where, 'button without an accessible name');
  }
  const labelled = new Set([...body.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((match) => match[1]));
  // A field inside its <label> is labelled by it.
  const wrapped = new Set([...body.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
    .flatMap((match) => [...match[1].matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((field) => field[0])));
  for (const [tag] of body.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
    if (/\stype="hidden"/.test(tag) || wrapped.has(tag) || namedByAria(tag, body)) continue;
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    if (!id || !labelled.has(id)) report(where, `form field without a label: ${tag.slice(0, 80)}`);
  }
}

const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) checkUrl(loc, 'sitemap.xml');

const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
for (const [, url] of llms.matchAll(/\]\(([^)]+)\)/g)) checkUrl(url, 'llms.txt');

if (problems.length) {
  console.error(`check-site: ${problems.length} problem(s)\n${problems.map((line) => `  ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-site: ${htmlFiles(DIST).length} HTML files, sitemap and llms.txt resolve; no problems`);
