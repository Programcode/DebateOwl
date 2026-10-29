import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useOfflineStatus } from '@/lib/network-status';
import { waitingCount } from '@/lib/offline-queue';
import { useQueuedWrites } from '@/lib/use-offline-queue';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * Shown while the device is offline or the screen's data came from saved
 * copies, and while changes wait in the offline queue. New notes, source
 * edits and switches are kept on the phone and sync later; AI and every other
 * save fail with their network error, so the notice says they wait.
 */
export function OfflineNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { offline, savedCopies } = useOfflineStatus();
  const { session } = useAuth();
  const count = waitingCount(useQueuedWrites(session?.user.id ?? null));
  if (!offline && !savedCopies && count === 0) return null;
  const reading = offline || savedCopies;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: colors.line }, style]}
      testID="offline-notice">
      <Icon name={reading ? 'cloudOff' : 'upload'} size={16} color={colors.faint} />
      <View style={styles.lines}>
        {reading ? (
          <Text tone="secondary" style={styles.text}>
            {t('mobile.offlineQueue.notice')}
          </Text>
        ) : null}
        {count > 0 ? (
          <Text tone="secondary" weight={reading ? 'semibold' : 'regular'} style={styles.text} testID="offline-queue-count">
            {offline ? t('mobile.offlineQueue.pending', { count }) : t('mobile.offlineQueue.syncing', { count })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.field,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lines: { flex: 1, gap: 2 },
  text: { fontSize: 13.5, lineHeight: 18 },
});
