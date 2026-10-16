export const SITE_ORIGIN = 'https://debate.pi-stack.org';
export const BRAND = 'DebateLab by Pi-Stack';

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
    title: 'DebateLab by Pi-Stack | AI Debate Prep, Cases & Rebuttals',
    description: 'DebateLab by Pi-Stack helps students and competitive debaters practice with AI opponents, case generation, rebuttal drills, evidence leads, coaching, timers, and argument flowcharts.',
    canonicalPath: '/',
  },
  '/terms': {
    title: 'Terms of Service | DebateLab by Pi-Stack',
    description: 'The terms for using DebateLab by Pi-Stack: accounts, subscriptions and billing, acceptable use, AI-generated content, intellectual property, and liability.',
    canonicalPath: '/terms',
  },
  '/privacy': {
    title: 'Privacy Policy | DebateLab by Pi-Stack',
    description: 'How DebateLab by Pi-Stack collects, uses, stores, and shares your information, how AI requests are processed, and the rights you have over your data.',
    canonicalPath: '/privacy',
  },
  '*': {
    title: 'Page not found | DebateLab by Pi-Stack',
    description: 'This page does not exist on DebateLab by Pi-Stack.',
  },
} as const satisfies Record<string, PageHead>;

export type PrerenderedRoute = keyof typeof PAGE_HEADS;

/** What index.html, the shell for every other route, says. */
export const SHELL_HEAD = {
  title: 'DebateLab',
  description: PAGE_HEADS['/'].description,
  robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
} as const;
