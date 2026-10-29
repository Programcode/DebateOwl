// Runs after scripts/sitemap.mjs. Reads the built site in dist/ the way a
// crawler or answer engine would and fails the build on:
// - an internal link, sitemap URL or llms.txt URL that does not resolve to a
//   page, a vercel.json redirect to a page, or an app rewrite;
// - a #fragment that names no id on the target page;
// - JSON-LD that does not parse or carries HTML entities into its text;
// - a FAQPage question that is not on the page, a home-page graph whose @id
//   references do not resolve or whose WebSite and SoftwareApplication are not
//   named for the product, or a page whose publisher or about names an @id the
//   home page does not define, or a home-page Organization not named for the
//   product or without its logo and parent;
// - an indexed page without the favicon and 192px icon links, or whose meta
//   author is not the organization;
// - an indexed page without its question H2 (#short-answer) as the first H2;
// - a page whose first heading is not its H1, or a heading that skips a level (H1 to H3);
// - an image without alt text, a button without a name, or a form field without a label;
// - hreflang links that do not resolve, leave out the page itself or x-default,
//   disagree with <html lang>, or are not the same set on every page they name.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const SITE = JSON.parse(readFileSync('src/config/site.json', 'utf8'));
const SITE_ORIGIN = SITE.origin;
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
// Indexed pages that answer no question of their own.
const NO_SHORT_ANSWER = new Set(['/terms', '/privacy', '/expocit/sources']);

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
// Rules for another host (the previous domain) never apply to links on this one.
const redirects = vercel.redirects.filter((rule) => !(rule.has ?? []).some((condition) => condition.type === 'host')).map((rule) => ({ match: sourcePattern(rule.source), destination: rule.destination }));
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
    // /best-ai-for-debate is a separate draft. These pages link to it before that file exists.
    const pending = decodeURIComponent(parsed.pathname).replace(/\/+$/, '') || '/';
    if (pending === '/best-ai-for-debate') return;
    report(where, `${url} does not resolve to a page`);
    return;
  }
  const fragment = decodeURIComponent(parsed.hash.slice(1));
  if (fragment && target.endsWith('.html') && !target.endsWith('app-shell.html') && !idsIn(target).has(fragment)) {
    report(where, `${url} names #${fragment}, which ${relative(DIST, target)} does not have`);
  }
}

const textOf = (html) => html.replace(/<[^>]+>/g, '').replace(/&[#\w]+;/g, 'x').trim();

/** The text inside the element whose start tag begins at `start`, nested elements included. */
function elementText(html, start) {
  const name = html.slice(start).match(/^<([\w-]+)/)?.[1];
  const open = html.indexOf('>', start);
  if (!name || open < 0) return '';
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  tags.lastIndex = open + 1;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return textOf(html.slice(open + 1, match.index));
  }
  return '';
}

/**
 * Whether attributes give an accessible name: a non-blank aria-label, or an
 * aria-labelledby whose referenced elements in `html` together have text.
 */
function namedByAria(attributes, html) {
  if (attributes.match(/\saria-label="([^"]*)"/)?.[1].trim()) return true;
  const ids = attributes.match(/\saria-labelledby="([^"]+)"/)?.[1].trim().split(/\s+/) ?? [];
  return ids.some((id) => {
    const at = html.search(new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    return at >= 0 && Boolean(elementText(html, html.lastIndexOf('<', at)));
  });
}

/** Every {"@id"} reference anywhere in a JSON-LD value. */
function references(value) {
  if (Array.isArray(value)) return value.flatMap(references);
  if (!value || typeof value !== 'object') return [];
  const own = Object.keys(value).length === 1 && value['@id'] ? [value['@id']] : [];
  return [...own, ...Object.values(value).flatMap(references)];
}

// The entities the home page defines, which every other page points at by @id.
const homeGraph = JSON.parse(readFileSync(join(DIST, 'index.html'), 'utf8').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const HOME_IDS = new Set(homeGraph.map((node) => node['@id']).filter(Boolean));

function checkStructuredData(where, data, body) {
  const graph = data['@graph'] ?? [data];
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'", nbsp: ' ' };
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (_, name) => entities[name]).replace(/\s+/g, ' ');
  for (const node of graph.filter((entry) => entry['@type'] === 'FAQPage')) {
    for (const question of node.mainEntity) {
      if (!visible.includes(question.name)) report(where, `FAQPage question "${question.name}" is not on the page`);
    }
  }
  for (const node of graph) {
    for (const key of ['publisher', 'author', 'about', 'isPartOf']) {
      const id = node[key]?.['@id'];
      if (id && !HOME_IDS.has(id)) report(where, `${node['@type']} ${key} names ${id}, which the home page does not define`);
    }
  }
  if (where !== 'index.html') return;
  const ids = new Set(graph.map((node) => node['@id']).filter(Boolean));
  for (const id of references(graph)) if (!ids.has(id)) report(where, `JSON-LD references ${id}, which the graph does not define`);
  const byType = (type) => graph.find((node) => node['@type'] === type) ?? {};
  for (const type of ['WebSite', 'SoftwareApplication']) {
    if (byType(type).name !== SITE.product) report(where, `${type}.name is "${byType(type).name}", not the product name "${SITE.product}"`);
  }
  if (!Array.isArray(byType('WebSite').alternateName)) report(where, 'WebSite.alternateName is not a list');
  const organization = byType('Organization');
  const sameAs = organization.sameAs;
  if (!Array.isArray(sameAs) || !sameAs.length || sameAs.some((url) => !url.startsWith('https://'))) report(where, 'Organization.sameAs is not a list of https URLs');
  // One name for one entity: the Organization on this domain is the product, and the company
  // that builds it is its parent, never a sameAs.
  if (organization.name !== SITE.product) report(where, `Organization.name is "${organization.name}", not the product name "${SITE.product}"`);
  const logo = organization.logo ?? {};
  if (logo['@type'] !== 'ImageObject' || !logo.url?.startsWith(`${SITE_ORIGIN}/`) || !logo.width || !logo.height) report(where, 'Organization.logo is not an ImageObject on this site with a width and height');
  const parent = organization.parentOrganization ?? {};
  if (!parent.name || !parent.url) report(where, 'Organization.parentOrganization has no name and url');
  else if (sameAs?.includes(parent.url)) report(where, `Organization.sameAs lists the parent ${parent.url}`);
  const alternates = byType('WebSite').alternateName ?? [];
  if (!alternates.some((name) => name !== SITE.product)) report(where, 'WebSite.alternateName only repeats the name');
}

// Every page names the favicon and a 192px icon, so search engines can pick one from any page.
const ICON_LINKS = ['href="/favicon.ico"', 'href="/icon-192.png" sizes="192x192"', 'href="/apple-touch-icon.png"'];

// Canonical URL -> the page's hreflang set, checked for agreement after the loop.
const hreflangSets = new Map();

for (const file of htmlFiles(DIST)) {
  const where = relative(DIST, file);
  const html = readFileSync(file, 'utf8');
  const body = html.slice(html.indexOf('<body'));

  const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)];
  if (alternates.length) {
    const set = Object.fromEntries(alternates.map(([, hreflang, href]) => [hreflang, href]));
    const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
    const language = html.match(/<html lang="([^"]+)"/)?.[1];
    if (!canonical || set[language] !== canonical) report(where, `hreflang="${language}" does not name this page's canonical URL ${canonical}`);
    if (!set['x-default']) report(where, 'hreflang links without x-default');
    for (const href of Object.values(set)) checkUrl(href, where);
    hreflangSets.set(canonical, { where, set });
  }

  for (const [, href] of body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    checkUrl(href.replaceAll('&amp;', '&'), where, file);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      checkStructuredData(where, JSON.parse(json), body);
    } catch (error) {
      report(where, `JSON-LD does not parse: ${error.message}`);
    }
    if (/&(amp|lt|gt|quot|#x?[\da-f]+);/i.test(json)) report(where, 'JSON-LD text contains HTML entities');
  }

  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
  const indexed = !/noindex/i.test(robots) && html.includes('<link rel="canonical"');
  const head = html.slice(0, html.indexOf('<body'));
  for (const link of ICON_LINKS) if (indexed && !head.includes(link)) report(where, `no icon link with ${link} in the head`);
  const author = head.match(/<meta name="author" content="([^"]*)"/)?.[1];
  if (indexed && author !== SITE.organization.name) report(where, `meta author is "${author}", not "${SITE.organization.name}"`);
  if (indexed && !NO_SHORT_ANSWER.has(routeOf(file))) {
    const firstH2 = body.match(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/);
    if (!firstH2 || !/\sid="short-answer"/.test(firstH2[1])) report(where, 'the first H2 is not the #short-answer question');
    else if (!textOf(firstH2[2]).endsWith('?')) report(where, 'the #short-answer H2 is not a question');
  }

  const levels = [...body.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  if (levels.length && levels[0] !== 1) report(where, `the first heading is an H${levels[0]}, not the H1`);
  levels.forEach((level, index) => {
    if (index && level > levels[index - 1] + 1) report(where, `heading level skips from H${levels[index - 1]} to H${level}`);
  });

  for (const [tag] of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(tag)) report(where, `image without alt text: ${tag.slice(0, 80)}`);
  }
  for (const [, attributes, content] of body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (!namedByAria(attributes, body) && !textOf(content)) report(where, 'button without an accessible name');
  }
  const labelled = new Set([...body.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((match) => match[1]));
  // A field inside a <label> element is labelled by it.
  const labelSpans = [...body.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map((match) => [match.index, match.index + match[0].length]);
  const insideLabel = (index) => labelSpans.some(([from, to]) => index > from && index < to);
  for (const { 0: tag, index } of body.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
    if (/\stype="hidden"/.test(tag) || insideLabel(index) || namedByAria(tag, body)) continue;
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    if (!id || !labelled.has(id)) report(where, `form field without a label: ${tag.slice(0, 80)}`);
  }
}

const sameSet = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
for (const { where, set } of hreflangSets.values()) {
  for (const [hreflang, href] of Object.entries(set)) {
    const other = hreflangSets.get(href);
    if (!other) report(where, `hreflang="${hreflang}" names ${href}, which lists no hreflang set back`);
    else if (!sameSet(set, other.set)) report(where, `hreflang set differs from the one on ${other.where}`);
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
