// Runs after scripts/prerender.mjs. Writes dist/sitemap.xml from the HTML pages
// in dist/: every page that names itself as canonical and is not noindex. Each
// <lastmod> is the dateModified the page itself declares in its JSON-LD; a page
// without one is listed without a lastmod rather than with a made-up date. A
// page with hreflang links in its head gets the same alternates as xhtml:link.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const SITE_ORIGIN = JSON.parse(readFileSync('src/config/site.json', 'utf8')).origin;

function htmlPages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'assets' || entry.name.startsWith('.') ? [] : htmlPages(path);
    return entry.name === 'index.html' ? [path] : [];
  });
}

function routeOf(file) {
  const folder = relative(DIST, file).split(sep).slice(0, -1).join('/');
  return folder ? `/${folder}` : '/';
}

const urls = [];
for (const file of htmlPages(DIST)) {
  const html = readFileSync(file, 'utf8');
  const route = routeOf(file);
  const url = `${SITE_ORIGIN}${route}`;
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (/noindex/i.test(robots) || canonical !== url) {
    console.log(`sitemap: skip ${route} (${canonical ? `canonical ${canonical}` : 'no canonical'}${robots.includes('noindex') ? ', noindex' : ''})`);
    continue;
  }
  const lastmod = html.match(/"dateModified":"(\d{4}-\d{2}-\d{2})"/)?.[1];
  if (!lastmod) console.log(`sitemap: ${route} declares no dateModified; listed without lastmod`);
  const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)]
    .map(([, hreflang, href]) => ({ hreflang, href }));
  urls.push({ url, lastmod, alternates });
}

urls.sort((a, b) => (a.url === `${SITE_ORIGIN}/` ? -1 : b.url === `${SITE_ORIGIN}/` ? 1 : a.url.localeCompare(b.url)));
const body = urls
  .map(({ url, lastmod, alternates }) => [
    '  <url>',
    `    <loc>${url}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    ...alternates.map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`),
    '  </url>',
  ].join('\n'))
  .join('\n');
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`,
);
console.log(`sitemap: ${urls.length} URLs, ${urls.filter((entry) => entry.lastmod).length} with lastmod, ${urls.filter((entry) => entry.alternates.length).length} with hreflang`);
