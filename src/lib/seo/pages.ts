import site from '@/config/site.json';
import { TOOL_PAGE_HEADS } from './tool-pages';

/** Brand and domain strings live in src/config/site.json; nothing else should hardcode them. */
export const SITE_ORIGIN = site.origin;
export const BRAND = site.brand;
export const PRODUCT = site.product;
export const ORGANIZATION = site.organization;
/** "DebateLab is an AI debate prep and practice app for …", the sentence agents quote. */
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
 * Head tags for the pages the build prerenders (scripts/prerender.mjs). The
 * client sets the same tags when it shows these pages (usePageHead), so a
 * crawler that runs the app sees what the HTML said.
 */
export const PAGE_HEADS = {
  '/': {
    title: `${BRAND} | AI Debate Prep, Cases & Rebuttals`,
    description: `${PRODUCT} is an AI debate prep and practice app for students and competitive debaters: cases, rebuttals, evidence, coaching and timed practice rounds against an AI opponent.`,
    canonicalPath: '/',
  },
  '/terms': {
    title: `Terms of Service | ${BRAND}`,
    description: `The terms for using ${BRAND}: accounts, subscriptions and billing, acceptable use, AI-generated content, intellectual property, and liability.`,
    canonicalPath: '/terms',
  },
  '/privacy': {
    title: `Privacy Policy | ${BRAND}`,
    description: `How ${BRAND} collects, uses, stores, and shares your information, how AI requests are processed, and the rights you have over your data.`,
    canonicalPath: '/privacy',
  },
  '/expocit/sources': {
    title: `Sources | ${BRAND}`,
    description: `The sources consulted during the research and development of ${BRAND}, listed alphabetically by author surname or institutional name.`,
    canonicalPath: '/expocit/sources',
  },
  ...TOOL_PAGE_HEADS,
  '*': {
    title: `Page not found | ${BRAND}`,
    description: `This page does not exist on ${BRAND}.`,
  },
} as const satisfies Record<string, PageHead>;

export type PrerenderedRoute = keyof typeof PAGE_HEADS;

/**
 * Head the client restores for a public page. index.html itself (the app
 * shell copied to app-shell.html) says `noindex, nofollow`, matching the
 * X-Robots-Tag on /app, /login and /share. Prerender writes `robots` onto
 * every page that has a canonical URL.
 */
export const SHELL_HEAD = {
  title: 'DebateLab',
  description: PAGE_HEADS['/'].description,
  robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
} as const;
