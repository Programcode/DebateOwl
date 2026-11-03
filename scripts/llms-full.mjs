// Runs after scripts/sitemap.mjs. Writes dist/llms-full.txt: llms.txt, then the
// plain text of the pages an answer engine needs to say what DebateOwl is, read
// from their built HTML so the text is what a visitor sees.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const SITE_ORIGIN = JSON.parse(readFileSync('src/config/site.json', 'utf8')).origin;
const PAGES = ['/', '/about', '/best-ai-for-debate', '/press', '/debate-case-example'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, name) => {
  if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  return ENTITIES[name.toLowerCase()] ?? entity;
});

/** The page's <main> as Markdown-ish text: headings two levels below the page's own section, list items with a dash. */
function plainText(html) {
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0];
  if (!main) throw new Error('no <main> element');
  const text = main
    .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<\/dt>\s*<dd\b[^>]*>/g, ': ')
    .replace(/<h([1-6])\b[^>]*>/g, (_, level) => `\n\n${'#'.repeat(Number(level) + 2)} `)
    .replace(/<\/h[1-6]>/g, '\n\n')
    .replace(/<(li|dt|summary)\b[^>]*>/g, '\n- ')
    .replace(/<\/?(p|div|section|article|header|ul|ol|dl|dd|details|table|tr|br|nav)\b[^>]*>/g, '\n')
    .replace(/<\/t[dh]>/g, ' | ')
    .replace(/<[^>]+>/g, '');
  return decode(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n')
    .trim();
}

const sections = PAGES.map((route) => {
  const html = readFileSync(join(DIST, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`), 'utf8');
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? route);
  try {
    return `## ${title}\n\nSource: ${SITE_ORIGIN}${route}\n\n${plainText(html)}`;
  } catch (error) {
    throw new Error(`llms-full: ${route}: ${error.message}`);
  }
});
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8').trim();
writeFileSync(join(DIST, 'llms-full.txt'), `${llms}\n\n# Page text\n\n${sections.join('\n\n')}\n`);
console.log(`llms-full: llms.txt and ${PAGES.length} pages`);
