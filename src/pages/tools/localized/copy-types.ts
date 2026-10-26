import type { FaqEntry, ToolPageRoute, ToolRoute } from '@/lib/seo/tool-pages';

/**
 * The page copy of the free tools in one language other than English. The
 * tool widgets themselves, the short answers and the head tags come from the
 * `tools` and `pageHead` catalogs; this holds what the English pages write
 * inline in JSX.
 *
 * Inline text may contain:
 * - `[anchor](/tools/debate-timer)`: a link. Write the English route of a free
 *   tool (or `/`); the page links to its address in this language. Any other
 *   path is linked as written.
 * - `{product}`: the product name from src/config/site.json.
 * - `{total}`: the number of practice motions in the generator.
 * Prices and the trial length never appear here: the CTA box adds them from site.json.
 */
export interface CopySection {
  heading: string;
  paragraphs?: string[];
  /** A numbered list, after the paragraphs. */
  steps?: string[];
  /** A bulleted list, after the paragraphs. */
  bullets?: string[];
  /** H3 sub-sections, after everything else. */
  subsections?: { heading: string; paragraphs: string[] }[];
}

export interface ToolPageCopy {
  /** The visible H1. */
  title: string;
  /** One paragraph under the H1. */
  intro: string;
  sections: CopySection[];
  /** Shown visibly and in the FAQPage JSON-LD; the hub has none. */
  faq: FaqEntry[];
  cta: { title: string; body: string };
}

export interface LocalizedToolsCopy {
  /** ISO date this language's copy last changed in substance. */
  modified: string;
  /** Name and one-line description of each tool, for the hub cards, breadcrumbs and "More free tools". */
  tools: Record<ToolPageRoute, { name: string; blurb: string }>;
  pages: Record<ToolRoute, ToolPageCopy>;
}
