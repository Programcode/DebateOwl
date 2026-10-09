import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Text } from '@/components/text';
import { useDebates } from '@/lib/debate-context';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * Shown while one-off mode is on, like the website's CurrentDebateStrip: the message always,
 * and "Return to debate" only when there is a Current Debate to return to.
 */
export function OneOffNotice({
  message = 'debate.oneOffStrip',
  style,
}: {
  message?: 'debate.oneOffStrip' | 'debate.oneOffActive';
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { oneOff, current, setOneOff } = useDebates();
  if (!oneOff) return null;
  return (
    <View style={[styles.notice, { borderColor: colors.border }, !current && styles.noAction, style]} testID="one-off-notice">
      <Text tone="secondary" style={styles.text}>
        {t(message)}
      </Text>
      {current ? <TextButton label={t('debate.returnToDebate')} onPress={() => setOneOff(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.field,
    paddingHorizontal: 14,
    paddingTop: 10,
    alignItems: 'flex-start',
  },
  noAction: { paddingBottom: 10 },
  text: { fontSize: 14, lineHeight: 19 },
});
