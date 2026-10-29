import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { OwlAvatar } from './owl';
import { Text } from './text';

import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The website's "Regenerating Arguments…" overlay, as a strip at the top of the case while one part is written again. */
export function RegeneratingStrip({ title }: { title: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.strip, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} testID="regenerating">
      <OwlAvatar pose="thinking" size={34} blink />
      <Text weight="bold" style={styles.text} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        {t('common.regenerating', { title })}
      </Text>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: radius.field, paddingHorizontal: 12, paddingVertical: 9 },
  text: { flex: 1, fontSize: 15, lineHeight: 20 },
});
