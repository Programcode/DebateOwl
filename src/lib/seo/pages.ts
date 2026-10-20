import site from '@/config/site.json';

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
  '*': {
    title: `Page not found | ${BRAND}`,
    description: `This page does not exist on ${BRAND}.`,
  },
} as const satisfies Record<string, PageHead>;

export type PrerenderedRoute = keyof typeof PAGE_HEADS;

/** What index.html, the shell for every other route, says. */
export const SHELL_HEAD = {
  title: 'DebateLab',
  description: PAGE_HEADS['/'].description,
  robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
} as const;
