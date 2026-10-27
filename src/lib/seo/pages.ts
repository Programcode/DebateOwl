import site from '@/config/site.json';
import { englishHead, type PageHeadId } from './head-text';
import { TOOL_PAGE_HEAD_IDS, TOOL_PAGE_HEADS } from './tool-pages';

/** Brand and domain strings live in src/config/site.json; nothing else should hardcode them. */
export const SITE_ORIGIN = site.origin;
export const BRAND = site.brand;
export const PRODUCT = site.product;
export const ORGANIZATION = site.organization;
/** The organization's own profiles elsewhere, for schema.org sameAs. */
export const ORGANIZATION_SAME_AS = site.organizationSameAs;
/** "DebateOwl is an AI debate prep and practice app for …", the sentence agents quote. */
export const DEFINITION = `${PRODUCT} is ${site.definition}.`;
export const PRICING = site.pricing;

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
  '/expocit/sources': { ...englishHead('sources'), canonicalPath: '/expocit/sources' },
  ...TOOL_PAGE_HEADS,
  '*': englishHead('notFound'),
} as const satisfies Record<string, PageHead>;

export type PrerenderedRoute = keyof typeof PAGE_HEADS;

/** Each prerendered page's `pageHead.<id>` catalog section. */
export const PAGE_HEAD_IDS: Record<PrerenderedRoute, PageHeadId> = {
  '/': 'home',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/expocit/sources': 'sources',
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
