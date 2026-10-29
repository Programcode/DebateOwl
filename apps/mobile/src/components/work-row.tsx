import { Link, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { IconTile, usePressScale } from './card';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { formatWhen } from '@/lib/dates';
import type { DebateItem, DebateItemKind } from '@/lib/debates';
import { canDeleteWork, hasDocumentText, useWorkActions } from '@/lib/work-actions';
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

/** The tab, or History, a saved result's document goes back to. */
export type OpenedFrom = 'debate' | 'prepare' | 'practice' | 'history';

/**
 * Where a saved item opens. Cases, attacks, brainstorms, factoids, Sparring
 * and Crossfire rounds open read-only as documents, a flowchart opens on the
 * Flowchart screen, and Practice work opens the Practice tab.
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
      return { pathname: '/flowchart', params: { id: item.id, from } };
    case 'sparring':
      return { pathname: '/sparring/[id]', params: { id: item.id, from } };
    case 'crossfire':
      return { pathname: '/crossfire-round/[id]', params: { id: item.id, from } };
    default:
      return '/practice';
  }
}

/**
 * One saved result or round, with its kind and when it was made. With `from`,
 * it is a link with a preview and a menu (Open, Discuss, Share, and Delete for
 * a case or a Sparring round, as the website's History allows).
 */
export function WorkRow({
  item,
  first,
  onPress,
  from,
  onDeleted,
}: {
  item: DebateItem;
  first: boolean;
  onPress?: () => void;
  from?: OpenedFrom;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const actions = useWorkActions();
  const press = usePressScale();
  const title = item.title || t(`debate.kinds.${item.kind}`);
  const href = from ? workHref(item, from) : null;
  // Practice work opens the Practice tab, which has nothing to preview, so it is a plain row that navigates itself.
  const linked = href !== null && href !== '/practice';
  const document = hasDocumentText(item);
  const remove = () => {
    void actions.remove(item).then((removed) => {
      if (removed) onDeleted?.();
    });
  };
  // VoiceOver offers the long-press menu's actions on the row itself (swipe up or down).
  const a11yActions = linked
    ? [
      ...(document ? [{ name: 'discuss', label: t('common.discuss') }, { name: 'share', label: t('mobile.library.share') }] : []),
      ...(canDeleteWork(item) ? [{ name: 'delete', label: t('common.delete') }] : []),
    ]
    : [];
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('mobile.common.openItem', { title })}
      accessibilityActions={a11yActions.length > 0 ? a11yActions : undefined}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === 'discuss') void actions.discuss(item);
        else if (name === 'share') void actions.share(item);
        else if (name === 'delete') remove();
      }}
      onPress={linked ? onPress : onPress ?? (href ? () => router.navigate(href) : undefined)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      testID="work-row"
      // One flat style object: inside a Link's slot the web preview hands it to the DOM as is.
      style={StyleSheet.flatten([!first && { borderTopWidth: 1, borderTopColor: colors.line }, { backgroundColor: colors.card }])}>
      {({ pressed }) => (
        <Animated.View style={[styles.row, pressed && styles.pressed, press.style]}>
          <IconTile name={KIND_ICONS[item.kind]} size={42} />
          <View style={styles.rowText}>
            <Text weight="semibold" style={styles.rowTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
              {t('mobile.debate.itemMeta', { kind: t(`debate.kinds.${item.kind}`), when: formatWhen(item.createdAt) })}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </Animated.View>
      )}
    </Pressable>
  );
  if (!linked) return row;
  return (
    <Link href={href} asChild>
      <Link.Trigger>{row}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {document ? (
          <Link.MenuAction icon="bubble.left.and.bubble.right" onPress={() => void actions.discuss(item)}>
            {t('common.discuss')}
          </Link.MenuAction>
        ) : null}
        {document ? (
          <Link.MenuAction icon="square.and.arrow.up" onPress={() => void actions.share(item)}>
            {t('mobile.library.share')}
          </Link.MenuAction>
        ) : null}
        {canDeleteWork(item) ? (
          <Link.MenuAction icon="trash" destructive onPress={remove}>
            {t('common.delete')}
          </Link.MenuAction>
        ) : null}
      </Link.Menu>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  pressed: { opacity: 0.7 },
});
