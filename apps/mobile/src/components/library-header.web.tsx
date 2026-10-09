import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import type { AddSourceKind } from './library-header';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

/** The web preview has no native header or menu, so it draws the mock's title row and menu. */
export function LibraryHeader({ title, onAdd, disabled }: { title: string; onAdd: (kind: AddSourceKind) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const items: { kind: AddSourceKind; label: string; icon: IconName }[] = [
    { kind: 'link', label: t('mobile.library.pasteLink'), icon: 'link' },
    { kind: 'note', label: t('mobile.library.writeNote'), icon: 'note' },
  ];
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" weight="bold" style={styles.title}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobile.library.add')}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
        testID="library-add"
        style={[styles.plus, { backgroundColor: colors.primary }, disabled && styles.disabled]}>
        <Icon name="plus" color={colors.onPrimary} size={24} />
      </Pressable>
      {open ? (
        <View accessibilityRole="menu" style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {items.map((item, index) => (
            <Pressable
              key={item.kind}
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                onAdd(item.kind);
              }}
              style={({ pressed }) => [
                styles.item,
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                pressed && { backgroundColor: colors.line },
              ]}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Icon name={item.icon} color={colors.foreground} size={22} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2, zIndex: 10 },
  title: { fontSize: 34, letterSpacing: -1, lineHeight: 41 },
  plus: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  menu: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: 252,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    boxShadow: '0 14px 40px -10px rgba(15,23,42,0.4)',
  },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, minHeight: 52 },
  itemLabel: { fontSize: 17 },
});
