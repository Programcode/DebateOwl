import site from '@/config/site.json';
import en from '@/locales/en.json';

/** The catalog section (`pageHead.<id>`) holding each page's title and description. */
export type PageHeadId = keyof typeof en.pageHead;

/** Fills `{{brand}}` and `{{product}}` in a head string; the same values usePageHead hands to t(). */
export const HEAD_NAMES = { brand: site.brand, product: site.product } as const;

const fill = (text: string) => text.replace(/\{\{(brand|product)\}\}/g, (_, name: keyof typeof HEAD_NAMES) => HEAD_NAMES[name]);

/**
 * A page's English head from the catalog. The prerender writes it into the
 * HTML, and usePageHead shows the same strings in the visitor's language.
 */
export function englishHead(id: PageHeadId): { title: string; description: string } {
  const head = en.pageHead[id];
  return { title: fill(head.title), description: fill(head.description) };
}
