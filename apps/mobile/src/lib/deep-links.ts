/**
 * Website links that open in the app (universal links): https://debateowl.com/share/<code>
 * and https://debateowl.com/app/<page>, also on www. Anything else, including http,
 * other hosts, a user name or port in the address, or an encoded segment, is not
 * ours. This file has no React Native or Expo imports, so it is unit-tested in Node,
 * and it parses by hand instead of with `URL`, which React Native only polyfills once
 * the Supabase client loads.
 */

const HOSTS = new Set(['debateowl.com', 'www.debateowl.com']);
/** The share function makes 16 letters and digits; older or future codes get some room, never unbounded. */
const SHARE_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_URL_LENGTH = 2048;

/** The website's /app pages (src/App.tsx) and the app route each opens. Missing pages open the Debate tab. */
const APP_PAGES: Record<string, string> = {
  '': '/',
  debate: '/',
  generate: '/generate',
  attack: '/attack',
  brainstorm: '/brainstorm',
  factoids: '/factoids',
  ask: '/ask',
  crossfire: '/crossfire',
  sparring: '/sparring',
  flowchart: '/flowchart',
  timer: '/timer',
  library: '/library',
  history: '/history',
  settings: '/you',
  billing: '/you',
};

/** A share code as the share screen accepts it, from a universal link or the app's own scheme. */
export function isShareCode(code: unknown): code is string {
  return typeof code === 'string' && SHARE_CODE.test(code);
}

/**
 * The app route for a website link, or null when the link is not one of ours.
 * Query and fragment (such as ?lang=) are dropped.
 */
export function appPathForUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) return null;
  const match = /^https:\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!match) return null;
  const [, authority, rawPath] = match;
  // No user info, port or trailing dot: only the two exact host names.
  if (!HOSTS.has(authority.toLowerCase())) return null;

  // One trailing slash is the same page; empty segments elsewhere are not a website route.
  const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const segments = path === '' || path === '/' ? [] : path.slice(1).split('/');
  if (segments.some((segment) => segment === '')) return null;

  const [first, ...rest] = segments;
  if (first?.toLowerCase() === 'share') {
    const [code] = rest;
    return rest.length === 1 && isShareCode(code) ? `/share/${code}` : null;
  }
  if (first?.toLowerCase() === 'app') {
    // Every website /app page has one segment at most, with no ids; anything deeper opens the Debate tab.
    if (rest.length > 1) return '/';
    const page = (rest[0] ?? '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(APP_PAGES, page) ? APP_PAGES[page] : '/';
  }
  return null;
}
