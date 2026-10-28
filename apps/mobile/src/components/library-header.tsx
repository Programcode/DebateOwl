import type { LibrarySort } from '@debatelab/core/library';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SORT_LABELS, TYPE_FILTERS, type LibraryHeaderProps } from './library-options';

import { useTheme } from '@/theme/use-theme';

export type { AddSourceKind, LibraryHeaderProps, SourceTypeFilter } from './library-options';

/**
 * The Library's large title, its round plus button (Paste a link, Write a
 * note, Import a file) and a More menu with the website's sort orders, the
 * type filter, New folder and Clear all, all native menus.
 * "Scan pages" from the mock is not in the app yet.
 */
export function LibraryHeader({ title, onAdd, disabled, sort, onSort, filter, onFilter, onNewFolder, onClearAll, canClear }: LibraryHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.primary} disabled={disabled} accessibilityLabel={t('mobile.library.more')}>
          <Stack.Toolbar.Menu inline title={t('libraryPage.sortBy')} icon="arrow.up.arrow.down">
            {(Object.keys(SORT_LABELS) as LibrarySort[]).map((value) => (
              <Stack.Toolbar.MenuAction key={value} isOn={sort === value} onPress={() => onSort(value)}>
                {t(SORT_LABELS[value])}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu title={t('mobile.library.show')} icon="line.3.horizontal.decrease">
            {TYPE_FILTERS.map((option) => (
              <Stack.Toolbar.MenuAction key={option.value} isOn={filter === option.value} onPress={() => onFilter(option.value)}>
                {t(option.label)}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.MenuAction icon="folder.badge.plus" onPress={onNewFolder}>
            {t('libraryPage.newFolder')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="trash" destructive disabled={!canClear} onPress={onClearAll}>
            {t('libraryPage.clearAll')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu
          icon="plus"
          variant="prominent"
          tintColor={colors.primary}
          disabled={disabled}
          accessibilityLabel={t('mobile.library.add')}>
          <Stack.Toolbar.MenuAction icon="link" onPress={() => onAdd('link')}>
            {t('mobile.library.pasteLink')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="pencil.line" onPress={() => onAdd('note')}>
            {t('mobile.library.writeNote')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="doc" onPress={() => onAdd('file')}>
            {t('mobile.library.importFile')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
