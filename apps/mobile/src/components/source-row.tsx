import { Link } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { IconTile } from './card';
import { WEB_SWITCH_THUMB } from './form-rows';
import { Icon } from './icon';
import { folderLabel, SOURCE_ICONS, sourceMeta } from './source-display';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import type { Source } from '@/lib/sources';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export interface SourceRowActions {
  onOpen: () => void;
  onToggle: (isActive: boolean) => void;
  onDelete: () => Promise<boolean>;
  onCopy: () => void;
  onShare: () => void;
  onMove: (folder: string) => void;
}

/** The website's quality badges: used in a case, importance and strength. */
function QualityBadges({ source, showFolder, compact, pending }: { source: Source; showFolder: boolean; compact: boolean; pending: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const semantic = source.metadata?.semantic;
  const badge = (key: string, label: string, primary = false) => (
    <View
      key={key}
      style={[styles.badge, primary ? { backgroundColor: colors.tile, borderColor: colors.chipSelectedBorder } : { borderColor: colors.border }]}>
      <Text weight="semibold" style={[styles.badgeText, { color: primary ? colors.chipSelectedForeground : colors.secondary }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={styles.badges}>
      {pending ? <WaitingToSync /> : null}
      {showFolder ? (
        <View style={[styles.badge, styles.folderBadge, { backgroundColor: colors.segmentTrack, borderColor: colors.segmentTrack }]}>
          <Icon name="folder" color={colors.secondary} size={12} />
          <Text weight="semibold" style={[styles.badgeText, { color: colors.secondary }]} numberOfLines={1}>
            {folderLabel(t, source.folder)}
          </Text>
        </View>
      ) : null}
      {semantic?.lastUsedInCase ? badge('used', t('sourceQuality.usedInCase'), true) : null}
      {semantic && !compact ? badge('importance', t('sourceQuality.importance', { level: t(`sourceQuality.levels.${semantic.importance}`) })) : null}
      {semantic && !compact ? badge('strength', t('sourceQuality.strength', { level: t(`sourceQuality.levels.${semantic.strength}`) })) : null}
    </View>
  );
}

/** A queued change that waits for the connection (offline-queue.ts). */
export function WaitingToSync() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, styles.folderBadge, { backgroundColor: colors.line, borderColor: colors.line }]} testID="waiting-to-sync">
      <Icon name="cloudOff" color={colors.faint} size={12} />
      <Text weight="semibold" style={[styles.badgeText, { color: colors.faint }]} numberOfLines={1}>
        {t('mobile.offlineQueue.waiting')}
      </Text>
    </View>
  );
}

/**
 * A Library source. Its switch says whether the AI uses it, as on the
 * website, and a source that is off is dimmed. Swipe left to delete (with
 * Undo), swipe right to turn it on or off, and press and hold for a preview
 * and the menu. On iPad, `selectInstead` opens it beside the list. A
 * `pending` source has a change that waits for the connection.
 */
export function SourceRow({
  source,
  folders,
  first,
  selected = false,
  selectInstead = false,
  showFolder = true,
  compact = false,
  pending = false,
  actions,
}: {
  source: Source;
  folders: string[];
  first: boolean;
  selected?: boolean;
  selectInstead?: boolean;
  /** Off while the list shows one folder. */
  showFolder?: boolean;
  /** Beside an open source on iPad, whose pane shows the rankings: only the folder and use. */
  compact?: boolean;
  pending?: boolean;
  actions: SourceRowActions;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const title = source.title || t('libraryPage.untitledSource');
  const toggleLabel = source.isActive ? t('mobile.library.turnOff') : t('mobile.library.turnOn');

  const remove = async () => {
    const removed = await actions.onDelete();
    if (!removed) swipeable.current?.close();
  };
  const toggle = () => {
    swipeable.current?.close();
    haptics.tap();
    actions.onToggle(!source.isActive);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={!first && { borderTopWidth: 1, borderTopColor: colors.line }}
      renderLeftActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          onPress={toggle}
          style={[styles.swipeAction, { backgroundColor: source.isActive ? colors.secondary : colors.primaryFill }]}>
          <Icon name={source.isActive ? 'shieldOff' : 'shield'} color="#ffffff" size={20} />
          <Text weight="semibold" style={styles.swipeLabel} numberOfLines={2}>
            {toggleLabel}
          </Text>
        </Pressable>
      )}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('libraryPage.deleteSourceLabel', { title })}
          onPress={() => void remove()}
          style={[styles.swipeAction, { backgroundColor: colors.destructive }]}>
          <Icon name="trash" color="#ffffff" size={20} />
          <Text weight="semibold" style={styles.swipeLabel}>
            {t('common.delete')}
          </Text>
        </Pressable>
      )}>
      {/* The switch sits beside the link, not in it, so turning a source on or off never opens it. */}
      <View style={[styles.row, { backgroundColor: selected ? colors.tile : colors.card }]}>
        <Link
          href={{ pathname: '/source/[id]', params: { id: source.id } }}
          asChild
          onPress={(event) => {
            if (!selectInstead) return;
            event.preventDefault();
            actions.onOpen();
          }}>
          <Link.Trigger>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.openItem', { title })}
              accessibilityState={selected ? { selected } : undefined}
              accessibilityActions={[
                { name: 'toggle', label: toggleLabel },
                { name: 'delete', label: t('common.delete') },
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'toggle') toggle();
                if (event.nativeEvent.actionName === 'delete') void remove();
              }}
              testID="source-row"
              // One flat style object: inside a Link's slot the web preview hands it to the DOM as is.
              style={{ flex: 1 }}>
              {({ pressed }) => (
                <View style={[styles.content, pressed && styles.pressed]}>
                  <View style={!source.isActive && styles.off}>
                    <IconTile name={SOURCE_ICONS[source.type]} size={42} />
                  </View>
                  <View style={[styles.rowText, !source.isActive && styles.off]}>
                    <Text weight="semibold" style={[styles.rowTitle, selected && { color: colors.chipSelectedForeground }]} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text tone="faint" style={styles.rowMeta} numberOfLines={3}>
                      {source.isActive ? sourceMeta(t, source) : `${t('mobile.library.turnedOff')} · ${sourceMeta(t, source)}`}
                    </Text>
                    <QualityBadges source={source} showFolder={showFolder} compact={compact} pending={pending} />
                  </View>
                </View>
              )}
            </Pressable>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction icon="doc.text" onPress={actions.onOpen}>
              {t('mobile.library.open')}
            </Link.MenuAction>
            <Link.MenuAction icon={source.isActive ? 'xmark.shield' : 'checkmark.shield'} onPress={toggle}>
              {toggleLabel}
            </Link.MenuAction>
            <Link.Menu title={t('mobile.library.moveTo')} icon="folder">
              {folders.map((folder) => (
                <Link.MenuAction key={folder} isOn={folder === source.folder} onPress={() => actions.onMove(folder)}>
                  {folderLabel(t, folder)}
                </Link.MenuAction>
              ))}
            </Link.Menu>
            <Link.MenuAction icon="doc.on.doc" onPress={actions.onCopy}>
              {t('common.copy')}
            </Link.MenuAction>
            <Link.MenuAction icon="square.and.arrow.up" onPress={actions.onShare}>
              {t('mobile.library.share')}
            </Link.MenuAction>
            <Link.MenuAction icon="trash" destructive onPress={() => void remove()}>
              {t('common.delete')}
            </Link.MenuAction>
          </Link.Menu>
        </Link>
        <View style={styles.switch}>
          <Switch
            value={source.isActive}
            onValueChange={(value) => {
              haptics.tap();
              actions.onToggle(value);
            }}
            accessibilityLabel={t('libraryPage.toggleSourceLabel', { title })}
            trackColor={{ true: colors.primaryFill, false: colors.segmentTrack }}
            ios_backgroundColor={colors.segmentTrack}
            thumbColor="#FFFFFF"
            testID="source-active"
            {...WEB_SWITCH_THUMB}
          />
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  switch: { paddingRight: 14, paddingVertical: 12, justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1, maxWidth: '100%' },
  folderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 200 },
  badgeText: { fontSize: 12, lineHeight: 17, flexShrink: 1 },
  swipeAction: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6 },
  swipeLabel: { color: '#ffffff', fontSize: 13, textAlign: 'center' },
});
