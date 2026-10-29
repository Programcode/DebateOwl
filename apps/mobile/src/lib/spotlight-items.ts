/**
 * What Spotlight indexes for a debate: its saved documents (cases, attacks,
 * brainstorms and factoids), each opening its document screen through the
 * app's scheme. No React Native or Expo imports, so it is unit-tested in Node;
 * spotlight.ts hands the items to iOS.
 */

/** One searchable item. Its URL is also its Spotlight identifier, which the package opens when the result is tapped. */
export type SpotlightItem = {
  /** An app link, such as `debatelab://case/<id>`. */
  url: `debatelab://${string}`;
  title: string;
  description?: string;
  keywords?: string[];
};

/** The kinds that open as a document, with the route each opens (src/app/<kind>/[id].tsx). */
const DOCUMENT_KINDS = new Set(['case', 'attack', 'brainstorm', 'factoids']);
/** Row ids are uuids; anything else is not put into a URL. */
const ROW_ID = /^[A-Za-z0-9-]{1,64}$/;
/** Spotlight is for finding, not an archive: the newest work of the debate is enough. */
export const SPOTLIGHT_LIMIT = 40;

export type IndexableWork = { id: string; kind: string; title: string; createdAt?: number };

/**
 * The debate's documents for Spotlight, newest first and each once, titled by
 * their own title (or the kind's name) and described by the debate's motion.
 */
export function spotlightWorkItems(
  work: readonly IndexableWork[],
  motion: string,
  kindLabel: (kind: string) => string,
): SpotlightItem[] {
  const seen = new Set<string>();
  const items: SpotlightItem[] = [];
  const ordered = [...work].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  for (const item of ordered) {
    if (!DOCUMENT_KINDS.has(item.kind) || !ROW_ID.test(item.id)) continue;
    const url = `debatelab://${item.kind}/${item.id}` as const;
    if (seen.has(url)) continue;
    seen.add(url);
    const kind = kindLabel(item.kind);
    items.push({ url, title: item.title.trim() || kind, description: motion.trim() || undefined, keywords: [kind] });
    if (items.length === SPOTLIGHT_LIMIT) break;
  }
  return items;
}
