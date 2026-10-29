import { GENERAL_FOLDER } from '@debatelab/core/library';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { ActionMenu } from './action-menu';
import { WEB_SWITCH_THUMB } from './form-rows';
import { Icon } from './icon';
import { folderLabel } from './source-display';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import type { Source } from '@/lib/sources';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The website's grounding card: whether the AI's answers use this debate's sources. */
export function GroundingBanner({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${active ? t('libraryPage.groundingActive') : t('libraryPage.groundingDisabled')}. ${active ? t('libraryPage.groundingActiveDesc') : t('libraryPage.groundingDisabledDesc')}`}
      testID="grounding-banner"
      style={[styles.banner, { backgroundColor: active ? colors.tile : colors.segmentTrack, borderColor: active ? colors.tileBorder : colors.border }]}>
      <View style={[styles.bannerIcon, { backgroundColor: active ? colors.primaryFill : colors.border }]}>
        <Icon name={active ? 'shield' : 'shieldOff'} color={active ? '#FFFFFF' : colors.secondary} size={19} />
      </View>
      <View style={styles.bannerText}>
        <Text weight="bold" style={[styles.bannerTitle, { color: active ? colors.tileText : colors.foreground }]}>
          {active ? t('libraryPage.groundingActive') : t('libraryPage.groundingDisabled')}
        </Text>
        <Text tone="secondary" style={styles.bannerDesc}>
          {active ? t('libraryPage.groundingActiveDesc') : t('libraryPage.groundingDisabledDesc')}
        </Text>
      </View>
    </View>
  );
}

/**
 * The website's Folder actions for the folder picked in the chips. The switch
 * is on while any source in it is on, so one tap turns a mixed folder off and
 * the next turns it all on; the menu has the website's Activate and
 * Deactivate, and renames (or merges) and deletes it. General cannot be
 * renamed or deleted.
 */
export function FolderBar({
  folder,
  sources,
  onSetActive,
  onRename,
  onDelete,
}: {
  folder: string;
  sources: Source[];
  onSetActive: (isActive: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [menu, setMenu] = useState(false);
  const active = sources.filter((source) => source.isActive).length;
  const anyOn = active > 0;
  const editable = folder !== GENERAL_FOLDER;
  const name = folderLabel(t, folder);
  return (
    <View style={[styles.folderBar, { backgroundColor: colors.card, borderColor: colors.border }]} testID="folder-bar">
      <Icon name="folder" color={colors.primary} size={21} />
      <View style={styles.folderText}>
        <Text weight="bold" style={styles.folderName} numberOfLines={2}>
          {name}
        </Text>
        <Text tone="faint" style={styles.folderMeta}>
          {sources.length === 0
            ? t('mobile.library.folderEmpty')
            : `${t('libraryPage.sourceCount', { count: sources.length })} · ${t('mobile.library.folderOn', { active, total: sources.length })}`}
        </Text>
      </View>
      <Switch
        value={anyOn}
        disabled={sources.length === 0}
        onValueChange={(value) => {
          haptics.tap();
          onSetActive(value);
        }}
        accessibilityLabel={`${t('libraryPage.useForGrounding')}: ${name}`}
        trackColor={{ true: colors.primaryFill, false: colors.segmentTrack }}
        ios_backgroundColor={colors.segmentTrack}
        thumbColor="#FFFFFF"
        testID="folder-active"
        {...WEB_SWITCH_THUMB}
      />
      <BouncePressable
        accessibilityRole="button"
        accessibilityLabel={t('libraryPage.folderActions')}
        hitSlop={8}
        onPress={() => setMenu(true)}
        testID="folder-menu"
        style={[styles.more, { backgroundColor: colors.segmentTrack }]}>
        <Icon name="more" color={colors.secondary} size={20} />
      </BouncePressable>
      <ActionMenu
        visible={menu}
        title={name}
        items={[
          { key: 'on', label: t('libraryPage.activateFolder'), icon: 'shield', disabled: sources.length === 0 || active === sources.length },
          { key: 'off', label: t('libraryPage.deactivateFolder'), icon: 'shieldOff', disabled: active === 0 },
          ...(editable
            ? [
              { key: 'rename', label: t('libraryPage.renameFolder'), icon: 'pencil' as const },
              { key: 'delete', label: t('common.delete'), icon: 'trash' as const, destructive: true },
            ]
            : []),
        ]}
        cancelLabel={t('common.cancel')}
        onClose={() => setMenu(false)}
        onSelect={(key) => {
          if (key === 'on' || key === 'off') {
            haptics.tap();
            onSetActive(key === 'on');
          } else if (key === 'rename') onRename();
          else onDelete();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: radius.card, paddingVertical: 11, paddingHorizontal: 13 },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, gap: 1 },
  bannerTitle: { fontSize: 15.5, lineHeight: 20 },
  bannerDesc: { fontSize: 14, lineHeight: 19 },
  folderBar: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 2, borderRadius: radius.card, paddingVertical: 10, paddingHorizontal: 13 },
  folderText: { flex: 1, gap: 1 },
  folderName: { fontSize: 16 },
  folderMeta: { fontSize: 13.5, lineHeight: 18 },
  more: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
