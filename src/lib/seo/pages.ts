import site from '@/config/site.json';
import { englishHead, type PageHeadId } from './head-text';
import { CASE_FORMAT } from './site-text';
import { TOOL_PAGE_HEAD_IDS, TOOL_PAGE_HEADS } from './tool-pages';

/** Brand and domain strings live in src/config/site.json; nothing else should hardcode them. */
export const SITE_ORIGIN = site.origin;
export const BRAND = site.brand;
export const PRODUCT = site.product;
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;

/**
 * The Organization behind the site, named for the product so search engines
 * see one name for one entity. Its founder is the person who runs it; Pi-Stack
 * is only the name he publishes under, not a company, so it appears as his URL
 * and never as a parent organization or legal name. A sameAs profile is the same
 * entity elsewhere: site.json lists only profiles that spell the name "DebateOwl"
 * and that DebateOwl itself runs; with none, the node has no sameAs. /press, the
 * fact sheet, is its subjectOf.
 */
export function organizationNode() {
  const { name, logo, description, disambiguatingDescription, sameAs, operator } = site.organization;
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name,
    alternateName: site.alternateName,
    url: `${SITE_ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}${logo.path}`, width: logo.width, height: logo.height },
    description,
    disambiguatingDescription,
    email: site.contactEmail,
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: site.contactEmail, availableLanguage: ['en', 'hu', 'es'] },
    founder: { '@type': 'Person', name: operator.name, url: operator.publishesAs.url, sameAs: [operator.github] },
    ...(sameAs.length ? { sameAs } : {}),
    subjectOf: { '@type': 'WebPage', '@id': `${SITE_ORIGIN}/press#webpage`, url: `${SITE_ORIGIN}/press`, name: PAGE_HEADS['/press'].title },
  };
}
export const PRICING = site.pricing;
/** The SoftwareApplication description: what it is, then what a case contains. The guides' copy in generate_seo_content.py matches. */
export const SOFTWARE_DESCRIPTION = `${site.tagline} ${CASE_FORMAT}`;

/** The month prices and plan facts were last checked, as "October 2026" in the given language. */
export function factsAsOf(language: string): string {
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${site.factsCheckedOn}T00:00:00Z`));
}

export interface PageHead {
  title: string;
  description: string;
  /** Pages without one are not indexed: the head says noindex and names no canonical URL. */
  canonicalPath?: string;
  /** A 1200x630 share image in public/, replacing the site-wide og:image. */
  image?: { path: string; alt: string };
}

/**
 * Head tags for the pages the build prerenders (scripts/prerender.mjs), in
 * English from the `pageHead` catalog section. The client sets the same tags
 * when it shows these pages (usePageHead), in the visitor's language, so a
 * crawler that runs the app in English sees what the HTML said.
 */
export const PAGE_HEADS = {
  '/': { ...englishHead('home'), canonicalPath: '/' },
  '/terms': { ...englishHead('terms'), canonicalPath: '/terms' },
  '/privacy': { ...englishHead('privacy'), canonicalPath: '/privacy' },
  '/about': { ...englishHead('about'), canonicalPath: '/about' },
  '/contact': { ...englishHead('contact'), canonicalPath: '/contact' },
  '/press': { ...englishHead('press'), canonicalPath: '/press' },
  '/expocit/sources': { ...englishHead('sources'), canonicalPath: '/expocit/sources' },
  '/ai-debate': { ...englishHead('aiDebate'), canonicalPath: '/ai-debate', image: { path: '/og/ai-debate.png', alt: 'DebateOwl AI debate partner: argue one side, the AI argues the other' } },
  ...TOOL_PAGE_HEADS,
  '*': englishHead('notFound'),
} as const satisfies Record<string, PageHead>;

export type PrerenderedRoute = keyof typeof PAGE_HEADS;

/** Each prerendered page's `pageHead.<id>` catalog section. */
export const PAGE_HEAD_IDS: Record<PrerenderedRoute, PageHeadId> = {
  '/': 'home',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/about': 'about',
  '/contact': 'contact',
  '/press': 'press',
  '/expocit/sources': 'sources',
  '/ai-debate': 'aiDebate',
  ...TOOL_PAGE_HEAD_IDS,
  '*': 'notFound',
};

/**
 * Head the client restores for a public page. index.html itself (the app
 * shell copied to app-shell.html) says `noindex, nofollow`, matching the
 * X-Robots-Tag on /app, /login and /share. Prerender writes `robots` onto
 * every page that has a canonical URL.
 */
export const SHELL_HEAD = {
  title: site.product,
  description: PAGE_HEADS['/'].description,
  robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
} as const;
