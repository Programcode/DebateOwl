import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useOfflineStatus } from '@/lib/network-status';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * Shown while the device is offline or the screen's data came from saved
 * copies. AI and saving stay where they are and fail with their network
 * error, so the notice says they wait for the connection.
 */
export function OfflineNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { offline, savedCopies } = useOfflineStatus();
  if (!offline && !savedCopies) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: colors.line }, style]}
      testID="offline-notice">
      <Icon name="cloudOff" size={16} color={colors.faint} />
      <Text tone="secondary" style={styles.text}>
        {t('mobile.offline.notice')}
      </Text>
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
  text: { flex: 1, fontSize: 13.5, lineHeight: 18 },
});
