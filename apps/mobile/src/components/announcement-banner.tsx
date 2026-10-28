import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { IconTile } from './card';
import { Icon } from './icon';
import { Text } from './text';

import type { Announcements } from '@/lib/use-announcements';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The website's AnnouncementBanner: one announcement at a time, its position, and a dismiss button. */
export function AnnouncementBanner({ announcements, style }: { announcements: Announcements; style?: ViewStyle }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { announcement, total, dismissing, dismissFailed, dismiss } = announcements;
  if (!announcement) return null;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={t('announcements.regionLabel')}
      accessibilityLiveRegion="polite"
      testID="announcement-banner"
      style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.primary }, style]}>
      <IconTile name="megaphone" size={36} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text weight="semibold" style={styles.title}>
            {announcement.title}
          </Text>
          {total > 1 ? (
            <Text tone="faint" style={styles.position}>
              {t('announcements.position', { position: 1, total })}
            </Text>
          ) : null}
        </View>
        <Text tone="secondary" style={styles.body}>
          {announcement.body}
        </Text>
        {dismissFailed ? (
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
            {t('announcements.dismissError')}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('announcements.dismissLabel', { title: announcement.title })}
        disabled={dismissing}
        onPress={dismiss}
        hitSlop={8}
        testID="announcement-dismiss"
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
        {dismissing ? <ActivityIndicator /> : <Icon name="x" color={colors.tabInactive} size={20} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 2, borderRadius: radius.card, padding: 14 },
  text: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  title: { fontSize: 16, lineHeight: 21 },
  position: { fontSize: 13 },
  body: { fontSize: 14.5, lineHeight: 20 },
  dismiss: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -6 },
  pressed: { opacity: 0.6 },
});
