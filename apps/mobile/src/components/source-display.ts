import type { TFunction } from 'i18next';

import type { IconName } from './icon-paths';

import { AUTO_SAVED_FOLDER, GENERAL_FOLDER } from '@debatelab/core/library';

import { formatRelativeDate } from '@/lib/dates';
import type { Source, SourceType } from '@/lib/sources';

export const SOURCE_ICONS: Record<SourceType, IconName> = { url: 'link', text: 'note', file: 'file' };

/** "Link, cited in 2 results" when the website counted uses, otherwise "Note, added 3 days ago". */
export function sourceMeta(t: TFunction, source: Source): string {
  const type = t(`mobile.library.types.${source.type}`);
  return source.useCount > 0
    ? t('mobile.library.metaCited', { type, count: source.useCount })
    : t('mobile.library.metaAdded', { type, when: formatRelativeDate(source.createdAt) });
}

/** A folder's name as the website shows it: General and Auto-saved are translated, the student's own are not. */
export function folderLabel(t: TFunction, folder: string): string {
  if (folder === GENERAL_FOLDER) return t('libraryPage.generalFolder');
  if (folder === AUTO_SAVED_FOLDER) return t('aiClient.autoSavedFolder');
  return folder;
}
