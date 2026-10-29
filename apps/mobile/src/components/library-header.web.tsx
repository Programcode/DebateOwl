import type { LibrarySort } from '@debatelab/core/library';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

/** Menus are fixed chrome: iOS's own menus stop growing at large accessibility sizes. */
const MENU_MAX_FONT_SCALE = 1.6;

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { SORT_LABELS, TYPE_FILTERS, type AddSourceKind, type LibraryHeaderProps } from './library-options';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

type Item = { key: string; label: string; icon?: IconName; on?: boolean; destructive?: boolean; disabled?: boolean; onPress: () => void };

/** The web preview has no native header or menu, so it draws the mock's title row and both menus. */
export function LibraryHeader({ title, onAdd, disabled, sort, onSort, filter, onFilter, onNewFolder, onClearAll, canClear }: LibraryHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState<'add' | 'more' | null>(null);
  const add: Item[] = ([
    { kind: 'link', label: t('mobile.library.pasteLink'), icon: 'link' },
    { kind: 'note', label: t('mobile.library.writeNote'), icon: 'note' },
    { kind: 'file', label: t('mobile.library.importFile'), icon: 'file' },
  ] as { kind: AddSourceKind; label: string; icon: IconName }[]).map((item) => ({ key: item.kind, label: item.label, icon: item.icon, onPress: () => onAdd(item.kind) }));
  const sections: { title?: string; items: Item[] }[] = [
    {
      title: t('libraryPage.sortBy'),
      items: (Object.keys(SORT_LABELS) as LibrarySort[]).map((value) => ({ key: value, label: t(SORT_LABELS[value]), on: sort === value, onPress: () => onSort(value) })),
    },
    {
      title: t('mobile.library.show'),
      items: TYPE_FILTERS.map((option) => ({ key: option.value, label: t(option.label), on: filter === option.value, onPress: () => onFilter(option.value) })),
    },
    {
      items: [
        { key: 'folder', label: t('libraryPage.newFolder'), icon: 'folder', onPress: onNewFolder },
        { key: 'clear', label: t('libraryPage.clearAll'), icon: 'trash', destructive: true, disabled: !canClear, onPress: onClearAll },
      ],
    },
  ];

  const row = (item: Item, divider: boolean) => (
    <Pressable
      key={item.key}
      accessibilityRole="menuitem"
      accessibilityState={{ checked: item.on, disabled: item.disabled }}
      disabled={item.disabled}
      onPress={() => {
        setOpen(null);
        item.onPress();
      }}
      style={({ pressed }) => [styles.item, divider && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && { backgroundColor: colors.line }, item.disabled && styles.disabled]}>
      <View style={styles.check}>{item.on ? <Icon name="check" color={colors.primary} size={18} /> : null}</View>
      <Text style={[styles.itemLabel, item.destructive && { color: colors.destructive }]} numberOfLines={2} maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}>
        {item.label}
      </Text>
      {item.icon ? <Icon name={item.icon} color={item.destructive ? colors.destructive : colors.foreground} size={21} /> : null}
    </Pressable>
  );

  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" weight="display" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.library.more')}
          accessibilityState={{ disabled, expanded: open === 'more' }}
          disabled={disabled}
          onPress={() => setOpen((value) => (value === 'more' ? null : 'more'))}
          testID="library-more"
          style={[styles.round, { backgroundColor: colors.tile }, disabled && styles.disabled]}>
          <Icon name="more" color={colors.tileForeground} size={22} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.library.add')}
          accessibilityState={{ disabled, expanded: open === 'add' }}
          disabled={disabled}
          onPress={() => setOpen((value) => (value === 'add' ? null : 'add'))}
          testID="library-add"
          style={[styles.round, { backgroundColor: colors.primaryFill }, disabled && styles.disabled]}>
          <Icon name="plus" color={colors.onPrimary} size={24} />
        </Pressable>
        {/* Under the buttons, wherever a large text size puts them. */}
        {open === 'add' ? (
          <View accessibilityRole="menu" style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {add.map((item, index) => row(item, index > 0))}
          </View>
        ) : null}
        {open === 'more' ? (
          <View accessibilityRole="menu" testID="library-more-menu" style={[styles.menu, styles.moreMenu, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <ScrollView>
              {sections.map((section, index) => (
                <View key={section.title ?? index} style={index > 0 && { borderTopWidth: 6, borderTopColor: colors.line }}>
                  {section.title ? (
                    <Text tone="faint" weight="semibold" style={styles.section} maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}>
                      {section.title}
                    </Text>
                  ) : null}
                  {section.items.map((item, itemIndex) => row(item, itemIndex > 0 || Boolean(section.title)))}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, marginBottom: 2, zIndex: 10 },
  title: { flexShrink: 1, fontSize: 34, letterSpacing: -1, lineHeight: 41 },
  buttons: { flexDirection: 'row', gap: 10 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  menu: {
    position: 'absolute',
    top: '100%',
    marginTop: 8,
    right: 0,
    width: 272,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    boxShadow: '0 14px 40px -10px rgba(11,42,110,0.4)',
  },
  moreMenu: { maxHeight: 560 },
  section: { fontSize: 13, paddingHorizontal: 17, paddingTop: 10, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingRight: 17, minHeight: 48 },
  check: { width: 20, alignItems: 'center' },
  itemLabel: { flex: 1, fontSize: 16.5 },
});
