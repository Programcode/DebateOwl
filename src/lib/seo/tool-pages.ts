import site from '@/config/site.json';
import { englishHead, type PageHeadId } from './head-text';

/**
 * Heads and structured data for the free tools under /tools. pages.ts spreads
 * TOOL_PAGE_HEADS into PAGE_HEADS, so the prerender and usePageHead treat
 * these like any other public page.
 */

const BRAND = site.brand;
const ORIGIN = site.origin;

/** Each tool page's `pageHead.<id>` catalog section, where its title and description live. */
export const TOOL_PAGE_HEAD_IDS = {
  '/tools': 'tools',
  '/tools/debate-timer': 'debateTimer',
  '/tools/debate-motion-generator': 'motionGenerator',
  '/tools/debate-flow-sheet': 'flowSheet',
  '/tools/speech-time-calculator': 'speechTimeCalculator',
} as const satisfies Record<string, PageHeadId>;

export type ToolRoute = keyof typeof TOOL_PAGE_HEAD_IDS;

export const TOOL_PAGE_HEADS = Object.fromEntries(
  Object.entries(TOOL_PAGE_HEAD_IDS).map(([route, id]) => [route, { ...englishHead(id), canonicalPath: route }]),
) as Record<ToolRoute, { title: string; description: string; canonicalPath: ToolRoute }>;
export type ToolPageRoute = Exclude<ToolRoute, '/tools'>;

/** The last time each page's content changed in substance; bump it with the change. */
export const TOOL_PAGES_MODIFIED: Record<ToolRoute, string> = {
  '/tools': '2026-10-26',
  '/tools/debate-timer': '2026-10-26',
  '/tools/debate-motion-generator': '2026-10-22',
  '/tools/debate-flow-sheet': '2026-10-26',
  '/tools/speech-time-calculator': '2026-10-26',
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
