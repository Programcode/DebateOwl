import site from '@/config/site.json';

/**
 * Heads and structured data for the free tools under /tools. pages.ts spreads
 * TOOL_PAGE_HEADS into PAGE_HEADS, so the prerender and usePageHead treat
 * these like any other public page.
 */

const BRAND = site.brand;
const ORIGIN = site.origin;

export const TOOL_PAGE_HEADS = {
  '/tools': {
    title: `Free Debate Tools: Timer, Motions, Flow Sheets | ${BRAND}`,
    description: 'Free debate tools that need no account: a format-aware round timer, a practice motion generator, printable flow sheets and a speech time calculator.',
    canonicalPath: '/tools',
  },
  '/tools/debate-timer': {
    title: `Free Debate Timer for PF, LD, Policy, BP & World Schools | ${BRAND}`,
    description: 'A free debate round timer with presets for Public Forum, Lincoln-Douglas, Policy, British Parliamentary, World Schools and Asian Parliamentary: protected time, POI knocks and prep banks.',
    canonicalPath: '/tools/debate-timer',
  },
  '/tools/debate-motion-generator': {
    title: `Debate Motion Generator: 300 Practice Motions | ${BRAND}`,
    description: 'Draw a random debate motion, or three for a veto drill, from 300 original practice motions sorted by topic, difficulty and motion type. THW and Resolved wording.',
    canonicalPath: '/tools/debate-motion-generator',
  },
  '/tools/debate-flow-sheet': {
    title: `Printable Debate Flow Sheet Generator | ${BRAND}`,
    description: 'Print a one-page debate flow sheet with a column for every speech in PF, LD, Policy, BP, World Schools or Asian Parliamentary, on A4 or Letter.',
    canonicalPath: '/tools/debate-flow-sheet',
  },
  '/tools/speech-time-calculator': {
    title: `Speech Time Calculator for Debate Speeches | ${BRAND}`,
    description: 'Paste a speech to see its word count, how long it takes to deliver at slow, average and fast pace, and which debate speech slots it fits. Runs in your browser.',
    canonicalPath: '/tools/speech-time-calculator',
  },
} as const;

export type ToolRoute = keyof typeof TOOL_PAGE_HEADS;
export type ToolPageRoute = Exclude<ToolRoute, '/tools'>;

/** The last time each page's content changed in substance; bump it with the change. */
export const TOOL_PAGES_MODIFIED: Record<ToolRoute, string> = {
  '/tools': '2026-10-22',
  '/tools/debate-timer': '2026-10-22',
  '/tools/debate-motion-generator': '2026-10-22',
  '/tools/debate-flow-sheet': '2026-10-22',
  '/tools/speech-time-calculator': '2026-10-22',
};

export interface FaqEntry {
  question: string;
  answer: string;
}

const ORGANIZATION_ID = `${ORIGIN}/#organization`;
const WEBSITE_ID = `${ORIGIN}/#website`;

function breadcrumbs(route: ToolRoute, name: string) {
  const items = [
    { name: BRAND, url: `${ORIGIN}/` },
    { name: 'Free debate tools', url: `${ORIGIN}/tools` },
    ...(route === '/tools' ? [] : [{ name, url: `${ORIGIN}${route}` }]),
  ];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  };
}

function webPage(route: ToolRoute, type = 'WebPage') {
  const head = TOOL_PAGE_HEADS[route];
  return {
    '@type': type,
    '@id': `${ORIGIN}${route}#webpage`,
    url: `${ORIGIN}${route}`,
    name: head.title,
    description: head.description,
    isPartOf: { '@id': WEBSITE_ID },
    dateModified: TOOL_PAGES_MODIFIED[route],
  };
}

/** One tool page: the web app itself, where it sits, and its FAQ. No ratings or reviews: there are none to report. */
export function toolStructuredData(route: ToolPageRoute, name: string, faq: readonly FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${ORIGIN}${route}#app`,
        name,
        url: `${ORIGIN}${route}`,
        description: TOOL_PAGE_HEADS[route].description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any (web browser)',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': ORGANIZATION_ID },
        dateModified: TOOL_PAGES_MODIFIED[route],
      },
      webPage(route),
      breadcrumbs(route, name),
      {
        '@type': 'FAQPage',
        '@id': `${ORIGIN}${route}#faq`,
        mainEntity: faq.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      },
    ],
  };
}

export function hubStructuredData(tools: readonly { route: ToolPageRoute; name: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...webPage('/tools', 'CollectionPage'),
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: tools.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.name,
            url: `${ORIGIN}${tool.route}`,
          })),
        },
      },
      breadcrumbs('/tools', 'Free debate tools'),
    ],
  };
}

/** The JSON for a <script type="application/ld+json">, with "<" escaped so it cannot close the element. */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}
