import type { LibrarySort } from '@debatelab/core/library';

/** The Library header's choices, shared by the native header and the web preview's (library-header.web.tsx). */

export type AddSourceKind = 'link' | 'note' | 'file';
export type SourceTypeFilter = 'all' | 'file' | 'url' | 'text';

/** The website's sort menu labels, in its order. */
export const SORT_LABELS: Record<LibrarySort, string> = {
  smart: 'libraryPage.sortSmart',
  mostUsed: 'libraryPage.sortMostUsed',
  importance: 'libraryPage.sortImportance',
  strength: 'libraryPage.sortStrength',
  newest: 'libraryPage.sortNewest',
  oldest: 'libraryPage.sortOldest',
  title: 'libraryPage.sortTitle',
  folder: 'libraryPage.sortFolder',
};

/** The type filter, in the mock's order. */
export const TYPE_FILTERS: { value: SourceTypeFilter; label: string }[] = [
  { value: 'all', label: 'mobile.library.filters.all' },
  { value: 'file', label: 'mobile.library.filters.files' },
  { value: 'url', label: 'mobile.library.filters.links' },
  { value: 'text', label: 'mobile.library.filters.notes' },
];

export interface LibraryHeaderProps {
  title: string;
  onAdd: (kind: AddSourceKind) => void;
  /** No Current Debate: nothing can be added, sorted or cleared. */
  disabled: boolean;
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  filter: SourceTypeFilter;
  onFilter: (filter: SourceTypeFilter) => void;
  onNewFolder: () => void;
  onClearAll: () => void;
  /** An empty Library has nothing to clear. */
  canClear: boolean;
}

