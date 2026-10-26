// Runs after scripts/check-site.mjs. Counts, for every URL in dist/sitemap.xml,
// how many other sitemap pages link to it, and fails the build on:
// - a sitemap page with fewer than MIN_INBOUND inbound links (an orphan, or close to one);
// - a homepage that links to fewer than MIN_HOME_LINKS distinct sitemap pages.
// `node scripts/check-links.mjs --report` prints every count as JSON and checks nothing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const SITE_ORIGIN = JSON.parse(readFileSync('src/config/site.json', 'utf8')).origin;
const MIN_INBOUND = 3;
const MIN_HOME_LINKS = 15;
// Pages that are linked from the footer or one source page on purpose, not guides that need readers.
const EXEMPT = new Set(['/terms', '/privacy', '/expocit/sources']);

const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname);
const inSitemap = new Set(routes);

/** The sitemap routes a page's <body> links to, itself excluded. */
function linksFrom(route) {
  const html = readFileSync(join(DIST, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  const targets = new Set();
  for (const [, href] of body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
    const url = new URL(href.replaceAll('&amp;', '&'), `${SITE_ORIGIN}${route}`);
    if (url.origin !== SITE_ORIGIN) continue;
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (path !== route && inSitemap.has(path)) targets.add(path);
  }
  return targets;
}

const outbound = new Map(routes.map((route) => [route, linksFrom(route)]));
const inbound = new Map(routes.map((route) => [route, 0]));
for (const targets of outbound.values()) for (const target of targets) inbound.set(target, inbound.get(target) + 1);
const homeLinks = outbound.get('/')?.size ?? 0;

if (process.argv.includes('--report')) {
  console.log(JSON.stringify({ urls: routes.length, homeLinks, inbound: Object.fromEntries(inbound) }, null, 2));
  process.exit(0);
}

const problems = [];
for (const [route, count] of inbound) {
  if (!EXEMPT.has(route) && count < MIN_INBOUND) problems.push(`${route} has ${count} inbound link(s) from other sitemap pages; the minimum is ${MIN_INBOUND}`);
}
if (homeLinks < MIN_HOME_LINKS) problems.push(`/ links to ${homeLinks} distinct sitemap pages; the minimum is ${MIN_HOME_LINKS}`);

if (problems.length) {
  console.error(`check-links: ${problems.length} problem(s)\n${problems.map((line) => `  ${line}`).join('\n')}`);
  process.exit(1);
}
const counts = [...inbound.values()];
console.log(`check-links: ${routes.length} sitemap URLs, inbound links ${Math.min(...counts)}-${Math.max(...counts)}, homepage links to ${homeLinks}; no problems`);
