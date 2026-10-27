import { createContext, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HEAD_NAMES } from './head-text';
import { localizedPath, useRouteLanguage } from './localized-routes';
import { PAGE_HEAD_IDS, PAGE_HEADS, SHELL_HEAD, SITE_ORIGIN, type PageHead, type PrerenderedRoute } from './pages';

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
 * moves on to a page that has none. The title and description follow the
 * interface language; the canonical URL is the address in the route's own
 * language, so /hu stays /hu. The structured data, og:url and hreflang links
 * the build wrote describe only the page first loaded, so they go when it does.
 */
export function usePageHead(route: PrerenderedRoute) {
  const { t } = useTranslation();
  const routeLanguage = useRouteLanguage();
  const id = PAGE_HEAD_IDS[route];
  const title = t(`pageHead.${id}.title`, HEAD_NAMES);
  const description = t(`pageHead.${id}.description`, HEAD_NAMES);

  // Its own effect: a language switch retitles the page without the cleanup below.
  useEffect(() => {
    document.title = title;
    setMeta('description', description);
  }, [title, description]);

  useEffect(() => {
    const head: PageHead = PAGE_HEADS[route];
    setMeta('robots', head.canonicalPath ? SHELL_HEAD.robots : 'noindex, nofollow');
    setCanonical(head.canonicalPath && localizedPath(head.canonicalPath, routeLanguage));
    return () => {
      document.title = SHELL_HEAD.title;
      setMeta('description', SHELL_HEAD.description);
      setMeta('robots', SHELL_HEAD.robots);
      setCanonical(undefined);
      document.head
        .querySelectorAll('script[type="application/ld+json"], meta[property="og:url"], link[rel="alternate"][hreflang]')
        .forEach((node) => node.remove());
    };
  }, [route, routeLanguage]);
}

const PageLabelContext = createContext<(label: string | null) => void>(() => undefined);

/** Lets a page under a route name the tab better than the route does (see usePageLabel). */
export const PageLabelProvider = PageLabelContext.Provider;

/**
 * Names the tab "<label> · DebateOwl" instead of the route's label while the
 * page shows it, as a missing share link does. The route keeps writing the
 * title, so a language switch cannot leave the route's label on top.
 */
export function usePageLabel(label: string | null) {
  const setLabel = useContext(PageLabelContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}

/** Sign-in, the signed-in app and share links: never indexed (vercel.json sends the same X-Robots-Tag). */
const PRIVATE_ROUTE = /^\/(login|auth|app|share)(\/|$)/;

/**
 * Titles each private page "<page> · DebateOwl" (the shell's title), gives it the landing
 * description, both in the interface language, and marks it noindex while it is on screen.
 * Every other route keeps the shell's head or sets its own.
 */
export function usePrivateRouteHead(pathname: string, label: string) {
  const { t } = useTranslation();
  const isPrivate = PRIVATE_ROUTE.test(pathname);
  const description = t('pageHead.home.description', HEAD_NAMES);
  useEffect(() => {
    if (!isPrivate) return;
    // "Sign in to DebateOwl" already names the app.
    document.title = label.includes(SHELL_HEAD.title) ? label : `${label} · ${SHELL_HEAD.title}`;
    setMeta('description', description);
    setMeta('robots', 'noindex, nofollow');
    setCanonical(undefined);
    return () => {
      document.title = SHELL_HEAD.title;
      setMeta('description', SHELL_HEAD.description);
      setMeta('robots', SHELL_HEAD.robots);
    };
  }, [isPrivate, label, description]);
}
