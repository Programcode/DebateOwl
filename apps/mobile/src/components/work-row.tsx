import type { Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconTile } from './card';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { formatWhen } from '@/lib/dates';
import type { DebateItem, DebateItemKind } from '@/lib/debates';
import { useTheme } from '@/theme/use-theme';

export const KIND_ICONS: Record<DebateItemKind, IconName> = {
  case: 'sparkles',
  attack: 'shield',
  brainstorm: 'bulb',
  factoids: 'book',
  chat: 'chat',
  flowchart: 'branch',
  crossfire: 'help',
  sparring: 'swords',
};

/** The tab a saved result's document goes back to. */
export type OpenedFrom = 'debate' | 'prepare' | 'practice';

/**
 * Where a saved item opens. Cases, attacks, brainstorms, factoids and Sparring
 * rounds open read-only as documents; Flowcharts open their "on its way" screen, and
 * Practice work opens the Practice tab.
 */
export function workHref(item: DebateItem, from: OpenedFrom): Href {
  switch (item.kind) {
    case 'case':
      return { pathname: '/case/[id]', params: { id: item.id, from } };
    case 'attack':
      return { pathname: '/attack/[id]', params: { id: item.id, from } };
    case 'brainstorm':
      return { pathname: '/brainstorm/[id]', params: { id: item.id, from } };
    case 'factoids':
      return { pathname: '/factoids/[id]', params: { id: item.id, from } };
    case 'flowchart':
      return { pathname: '/coming/[tool]', params: { tool: item.kind } };
    case 'sparring':
      return { pathname: '/sparring/[id]', params: { id: item.id, from } };
    default:
      return '/practice';
  }
}

/** One saved result or round, with its kind and when it was made. */
export function WorkRow({ item, first, onPress }: { item: DebateItem; first: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('debate.openItemAria', { title: item.title || t(`debate.kinds.${item.kind}`) })}
      onPress={onPress}
      testID="work-row"
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
      <IconTile name={KIND_ICONS[item.kind]} size={42} />
      <View style={styles.rowText}>
        <Text weight="semibold" style={styles.rowTitle} numberOfLines={1}>
          {item.title || t(`debate.kinds.${item.kind}`)}
        </Text>
        <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
          {t('mobile.debate.itemMeta', { kind: t(`debate.kinds.${item.kind}`), when: formatWhen(item.createdAt) })}
        </Text>
      </View>
      <Icon name="chevronRight" color={colors.tabInactive} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  pressed: { opacity: 0.7 },
});
