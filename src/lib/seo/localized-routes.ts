import { createContext, useContext } from 'react';
import site from '@/config/site.json';
import routes from '@/config/localized-routes.json';
import type { AppLanguage } from '@/lib/languages';

/**
 * Public pages that also exist in Hungarian and Spanish, each under its own
 * address (/hu, /es/tools/cronometro-debate). src/config/localized-routes.json
 * is the one list: the router, the prerender, the sitemap, check-site and
 * llms.txt all read it. Every other page is English only.
 */
export type LocalizedRoute = keyof typeof routes;
export type PageLanguage = AppLanguage;

export const LOCALIZED_ROUTES = routes as Record<LocalizedRoute, Record<Exclude<PageLanguage, 'en'>, string>>;
export const PAGE_LANGUAGES = ['en', 'hu', 'es'] as const satisfies readonly PageLanguage[];

export function isLocalizedRoute(route: string): route is LocalizedRoute {
  return Object.prototype.hasOwnProperty.call(LOCALIZED_ROUTES, route);
}

/** The address of an English page in `language`; English, and pages with no translation, keep their own. */
export function localizedPath(route: string, language: PageLanguage): string {
  return language !== 'en' && isLocalizedRoute(route) ? LOCALIZED_ROUTES[route][language] : route;
}

/** Every translated address, with its English page and language. */
export const LOCALIZED_PATHS: { path: string; route: LocalizedRoute; language: Exclude<PageLanguage, 'en'> }[] = (
  Object.entries(LOCALIZED_ROUTES) as [LocalizedRoute, Record<'hu' | 'es', string>][]
).flatMap(([route, paths]) => (['hu', 'es'] as const).map((language) => ({ path: paths[language], route, language })));

/** The language a translated address is in, or null for every other path. */
export function pathLanguage(pathname: string): Exclude<PageLanguage, 'en'> | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return LOCALIZED_PATHS.find((entry) => entry.path === normalized)?.language ?? null;
}

/** hreflang alternates for a page with translations: each language, then x-default (English). */
export function hreflangAlternates(route: LocalizedRoute): { hreflang: string; href: string }[] {
  return [
    ...PAGE_LANGUAGES.map((language) => ({ hreflang: language, href: `${site.origin}${localizedPath(route, language)}` })),
    { hreflang: 'x-default', href: `${site.origin}${route}` },
  ];
}

const RouteLanguageContext = createContext<PageLanguage>('en');

/** The language of the address being shown: 'en' everywhere except /hu… and /es… pages. */
export const RouteLanguageProvider = RouteLanguageContext.Provider;
export const useRouteLanguage = () => useContext(RouteLanguageContext);
