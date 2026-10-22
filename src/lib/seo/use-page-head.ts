import { useEffect } from 'react';
import { BRAND, PAGE_HEADS, SHELL_HEAD, SITE_ORIGIN, type PrerenderedRoute } from './pages';

function setMeta(name: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setCanonical(path: string | undefined) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!path) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.head.appendChild(document.createElement('link'));
  link.rel = 'canonical';
  link.href = `${SITE_ORIGIN}${path}`;
}

/**
 * Gives a prerendered page its own title, description, canonical URL and
 * robots rule while it is on screen, and puts the shell's back when the visitor
 * moves on to a page that has none. The structured data and og:url the build
 * wrote describe only the page first loaded, so they go when it does.
 */
export function usePageHead(route: PrerenderedRoute) {
  useEffect(() => {
    const head: { title: string; description: string; canonicalPath?: string } = PAGE_HEADS[route];
    document.title = head.title;
    setMeta('description', head.description);
    setMeta('robots', head.canonicalPath ? SHELL_HEAD.robots : 'noindex');
    setCanonical(head.canonicalPath);
    return () => {
      document.title = SHELL_HEAD.title;
      setMeta('description', SHELL_HEAD.description);
      setMeta('robots', SHELL_HEAD.robots);
      setCanonical(undefined);
      document.head.querySelectorAll('script[type="application/ld+json"], meta[property="og:url"]').forEach((node) => node.remove());
    };
  }, [route]);
}

/** Sign-in, the signed-in app and share links: never indexed (vercel.json sends the same X-Robots-Tag). */
const PRIVATE_ROUTE = /^\/(login|app|share)(\/|$)/;

/**
 * Titles each private page "<page> · DebateLab" and marks it noindex while it
 * is on screen. Every other route keeps the shell's head or sets its own.
 */
export function usePrivateRouteHead(pathname: string, label: string) {
  const isPrivate = PRIVATE_ROUTE.test(pathname);
  useEffect(() => {
    if (!isPrivate) return;
    // "Sign in to DebateLab" already names the brand.
    document.title = label.includes(BRAND) ? label : `${label} · ${BRAND}`;
    setMeta('robots', 'noindex, nofollow');
    setCanonical(undefined);
    return () => {
      document.title = SHELL_HEAD.title;
      setMeta('robots', SHELL_HEAD.robots);
    };
  }, [isPrivate, label]);
}
