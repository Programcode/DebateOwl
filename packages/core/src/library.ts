import type { SourceSemanticMetadata } from './ai/discovered-sources';

/**
 * The Library's folder list, search and sort orders, shared by the website's
 * LibraryPage and the iOS app's Library so both list a debate's sources the same way.
 */

export const GENERAL_FOLDER = 'General';
export const AUTO_SAVED_FOLDER = 'Auto-saved';

/** The website's sort menu, in its order. `smart` is the default. */
export const LIBRARY_SORTS = ['smart', 'mostUsed', 'importance', 'strength', 'newest', 'oldest', 'title', 'folder'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** The fields of a Library source these rules read. */
export interface LibrarySourceLike {
  title: string;
  content: string;
  origin?: string | null;
  folder?: string | null;
  debateId?: string | null;
  createdAt: number;
  metadata?: { semantic?: SourceSemanticMetadata; qualityScore?: number } | null;
}

export function normalizeFolder(folder?: string | null): string {
  return folder?.trim() || GENERAL_FOLDER;
}

/**
 * One debate's folders, sorted, as the Library's filter chips list them.
 * Folder names belong to the account, so a name only other debates use is
 * hidden, while General and new empty folders stay.
 */
export function libraryFolders(
  accountFolders: string[],
  debateSources: Pick<LibrarySourceLike, 'folder'>[],
  otherDebateFolders: Iterable<string>,
): string[] {
  const elsewhere = new Set(Array.from(otherDebateFolders, normalizeFolder));
  const here = debateSources.map((source) => normalizeFolder(source.folder));
  return Array.from(new Set([
    ...(accountFolders.length > 0 ? accountFolders : [GENERAL_FOLDER])
      .map(normalizeFolder)
      .filter((folder) => folder === GENERAL_FOLDER || !elsewhere.has(folder) || here.includes(folder)),
    ...here,
  ])).sort();
}

/** The website's search: title, text, origin or folder contain the query, ignoring case. */
export function matchesLibrarySearch(source: LibrarySourceLike, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [source.title, source.content, source.origin || '', normalizeFolder(source.folder)]
    .some((value) => value.toLowerCase().includes(needle));
}

/** A sorted copy, in one of the website's sort orders. */
export function sortLibrarySources<T extends LibrarySourceLike>(sources: readonly T[], sortBy: LibrarySort): T[] {
  return sources.slice().sort((a, b) => {
    const aSemantic = a.metadata?.semantic;
    const bSemantic = b.metadata?.semantic;
    switch (sortBy) {
      case 'smart':
        return Number(Boolean(bSemantic?.lastUsedInCase)) - Number(Boolean(aSemantic?.lastUsedInCase)) ||
          (bSemantic?.importance ?? 0) - (aSemantic?.importance ?? 0) ||
          (bSemantic?.strength ?? 0) - (aSemantic?.strength ?? 0) ||
          (b.metadata?.qualityScore ?? 0) - (a.metadata?.qualityScore ?? 0) ||
          b.createdAt - a.createdAt;
      case 'mostUsed':
        return (bSemantic?.useCount ?? 0) - (aSemantic?.useCount ?? 0) || b.createdAt - a.createdAt;
      case 'importance':
        return (bSemantic?.importance ?? 0) - (aSemantic?.importance ?? 0) || b.createdAt - a.createdAt;
      case 'strength':
        return (bSemantic?.strength ?? 0) - (aSemantic?.strength ?? 0) || b.createdAt - a.createdAt;
      case 'oldest':
        return a.createdAt - b.createdAt;
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'folder': {
        const folderCmp = normalizeFolder(a.folder).localeCompare(normalizeFolder(b.folder));
        return folderCmp !== 0 ? folderCmp : (a.title || '').localeCompare(b.title || '');
      }
      case 'newest':
      default:
        return b.createdAt - a.createdAt;
    }
  });
}
