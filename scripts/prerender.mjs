// Runs after `vite build`. Writes real HTML for the public pages into dist/:
// index.html (the landing page), terms/index.html, privacy/index.html, the
// free tools, the Hungarian and Spanish pages (hu/…, es/…) and 404.html, each
// with its own head. The unchanged build of index.html becomes
// app-shell.html, which vercel.json serves for app routes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const DIST = 'dist';
const SITE_ORIGIN = JSON.parse(readFileSync('src/config/site.json', 'utf8')).origin;
// The landing page's lastmod is the last commit that changed these.
const LANDING_SOURCES = ['src/pages/LandingPage.tsx', 'src/components/landing', 'src/lib/seo/pages.ts'];

const escapeAttribute = (value) => value
  .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * The commit date of the newest change to the landing sources, or undefined.
 * In a shallow clone (Vercel's), a file untouched since the clone's oldest
 * commit reports that commit, which says nothing about the file, so it counts
 * as unknown.
 */
function landingModified() {
  try {
    const [hash, date] = git('log', '-1', '--format=%H %cs', '--', ...LANDING_SOURCES).split(' ');
    if (!hash || !date) return undefined;
    const shallowFile = git('rev-parse', '--git-path', 'shallow');
    if (existsSync(shallowFile) && readFileSync(shallowFile, 'utf8').split('\n').includes(hash)) {
      console.log('prerender: landing sources predate this shallow clone; the landing page gets no dateModified');
      return undefined;
    }
    return date;
  } catch {
    console.log('prerender: no git history; the landing page gets no dateModified');
    return undefined;
  }
}

function replaceOnce(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) ?? [];
  if (matches.length !== 1) throw new Error(`index.html should have exactly one ${label}, found ${matches.length}`);
  return html.replace(pattern, replacement);
}

/** The page chunk's JavaScript and CSS that the shell does not load already. */
function pageAssets(manifest, module, shell) {
  const scripts = new Set();
  const styles = new Set();
  const visit = (key) => {
    const entry = manifest[key];
    if (!entry) throw new Error(`The Vite manifest has no entry for ${key}`);
    if (!shell.includes(`/${entry.file}`)) scripts.add(`/${entry.file}`);
    for (const css of entry.css ?? []) if (!shell.includes(`/${css}`)) styles.add(`/${css}`);
    for (const imported of entry.imports ?? []) visit(imported);
  };
  visit(module);
  return { scripts: [...scripts], styles: [...styles] };
}

function pageHtml(shell, page, assets) {
  const { head } = page;
  let html = shell;
  html = replaceOnce(html, /<html lang="en">/, `<html lang="${page.language ?? 'en'}">`, '<html lang="en">');
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeText(head.title)}</title>`, 'title');
  for (const [pattern, value, label] of [
    [/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttribute(head.description)}" />`, 'description'],
    [/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeAttribute(head.title)}" />`, 'og:title'],
    [/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeAttribute(head.description)}" />`, 'og:description'],
    [/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeAttribute(head.title)}" />`, 'twitter:title'],
    [/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeAttribute(head.description)}" />`, 'twitter:description'],
  ]) html = replaceOnce(html, pattern, value, label);
  // The shell document is noindex (app, login, share). A public page puts the
  // index directive back; a page without a canonical URL stays noindex.
  const robots = head.canonicalPath
    ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    : 'noindex, nofollow';
  html = replaceOnce(html, /<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${robots}" />`, 'robots');

  const added = [];
  if (head.canonicalPath) {
    const url = `${SITE_ORIGIN}${head.canonicalPath}`;
    added.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
  }
  // A page that exists in English, Hungarian and Spanish names all three, itself included.
  for (const { hreflang, href } of page.alternates ?? []) {
    added.push(`<link rel="alternate" hreflang="${hreflang}" href="${escapeAttribute(href)}" />`);
  }
  for (const href of assets.styles) added.push(`<link rel="stylesheet" href="${href}" />`);
  for (const href of assets.scripts) added.push(`<link rel="modulepreload" crossorigin href="${href}" />`);
  if (page.structuredData) {
    // "<" escaped so the JSON can never close the script element.
    const json = JSON.stringify(page.structuredData).replaceAll('<', '\\u003c');
    added.push(`<script type="application/ld+json">${json}</script>`);
  }
  html = replaceOnce(html, /<\/head>/, `    ${added.join('\n    ')}\n  </head>`, '</head>');

  // The page itself replaces the startup shell; the no-script notice is then redundant.
  html = replaceOnce(
    html,
    /<div id="root">\s*<main class="app-startup-shell"[\s\S]*?<\/main>\s*<\/div>/,
    `<div id="root" data-prerendered="${page.route}">${page.body}</div>`,
    'startup shell in #root',
  );
  return replaceOnce(html, /\s*<noscript>[\s\S]*?<\/noscript>/, '', 'noscript block');
}

const shell = readFileSync(join(DIST, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(DIST, '.vite/manifest.json'), 'utf8'));
writeFileSync(join(DIST, 'app-shell.html'), shell);

/**
 * The dev server would resolve `import owl from '@/assets/owl/owl-point.svg'`
 * to /src/assets/owl/owl-point.svg, which dist/ does not have. Every asset the
 * build emitted is in the manifest, so an import of one resolves to the built,
 * hashed file instead.
 */
function builtAssetUrls() {
  const root = `${process.cwd()}/`;
  return {
    name: 'prerender-built-asset-urls',
    enforce: 'pre',
    load(id) {
      const path = id.split('?')[0];
      if (!path.startsWith(root)) return undefined;
      const entry = manifest[path.slice(root.length)];
      if (!entry || entry.isEntry || entry.isDynamicEntry || /\.[cm]?[jt]sx?$/.test(path)) return undefined;
      return `export default ${JSON.stringify(`/${entry.file}`)};`;
    },
  };
}

// Vite's SSR loader runs the page modules in Node with the app's own config and aliases.
const server = await createServer({
  mode: 'production',
  appType: 'custom',
  logLevel: 'warn',
  // Its own dependency cache: in the shared node_modules/.vite this server
  // re-optimizes the deps a running dev server is serving, and that server's
  // pages then fail to load their lazy routes (npm run verify builds while the
  // smoke tests run).
  cacheDir: 'node_modules/.vite-prerender',
  plugins: [builtAssetUrls()],
  server: { middlewareMode: true, hmr: false, ws: false },
});
try {
  const { prerenderPages } = await server.ssrLoadModule('/src/prerender/entry.tsx');
  const pages = await prerenderPages({ landingModified: landingModified() });
  for (const page of pages) {
    // A source path in a page is a file the site does not serve.
    const sourceUrl = page.body.match(/["'(]\/src\/[^"')]*/);
    if (sourceUrl) throw new Error(`prerender: ${page.route} references ${sourceUrl[0].slice(1)}, which is not in dist/`);
    const out = join(DIST, page.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, pageHtml(shell, page, pageAssets(manifest, page.module, shell)));
    console.log(`prerender: ${page.route} -> ${out}`);
  }
} finally {
  await server.close();
}
