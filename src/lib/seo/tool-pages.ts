import site from '@/config/site.json';
import { englishHead, type PageHeadId } from './head-text';
import { localizedPath, type PageLanguage } from './localized-routes';

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

/**
 * A tool page in Hungarian or Spanish: its head in that language, the hub's
 * name for the breadcrumb, and when its copy last changed. English pages pass none.
 */
export interface ToolPageLocale {
  language: Exclude<PageLanguage, 'en'>;
  title: string;
  description: string;
  hubName: string;
  modified: string;
}

const pageUrl = (route: ToolRoute, locale?: ToolPageLocale) => `${ORIGIN}${localizedPath(route, locale?.language ?? 'en')}`;

function breadcrumbs(route: ToolRoute, name: string, locale?: ToolPageLocale) {
  const items = [
    { name: BRAND, url: `${ORIGIN}${localizedPath('/', locale?.language ?? 'en')}` },
    { name: locale?.hubName ?? 'Free debate tools', url: pageUrl('/tools', locale) },
    ...(route === '/tools' ? [] : [{ name, url: pageUrl(route, locale) }]),
  ];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  };
}

function webPage(route: ToolRoute, type: string, locale?: ToolPageLocale) {
  const head = locale ?? TOOL_PAGE_HEADS[route];
  return {
    '@type': type,
    '@id': `${pageUrl(route, locale)}#webpage`,
    url: pageUrl(route, locale),
    name: head.title,
    description: head.description,
    ...(locale ? { inLanguage: locale.language } : {}),
    isPartOf: { '@id': WEBSITE_ID },
    dateModified: locale?.modified ?? TOOL_PAGES_MODIFIED[route],
  };
}

/** One tool page: the web app itself, where it sits, and its FAQ. No ratings or reviews: there are none to report. */
export function toolStructuredData(route: ToolPageRoute, name: string, faq: readonly FaqEntry[], locale?: ToolPageLocale) {
  const url = pageUrl(route, locale);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name,
        url,
        description: (locale ?? TOOL_PAGE_HEADS[route]).description,
        ...(locale ? { inLanguage: locale.language } : {}),
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any (web browser)',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': ORGANIZATION_ID },
        dateModified: locale?.modified ?? TOOL_PAGES_MODIFIED[route],
      },
      webPage(route, 'WebPage', locale),
      breadcrumbs(route, name, locale),
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faq.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      },
    ],
  };
}

export function hubStructuredData(tools: readonly { route: ToolPageRoute; name: string }[], locale?: ToolPageLocale) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...webPage('/tools', 'CollectionPage', locale),
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: tools.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.name,
            url: pageUrl(tool.route, locale),
          })),
        },
      },
      breadcrumbs('/tools', locale?.hubName ?? 'Free debate tools', locale),
    ],
  };
}

/** The JSON for a <script type="application/ld+json">, with "<" escaped so it cannot close the element. */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}
