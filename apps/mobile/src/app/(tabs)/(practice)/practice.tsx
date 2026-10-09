import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { PRACTICE_TOOLS } from '@/components/practice-tools';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/use-theme';

/** The Practice tools. Attack and Ask open full screen; the others say they are on their way. */
export default function PracticeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.practice')} />
      <Card style={styles.list}>
        {PRACTICE_TOOLS.map((tool, index) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            onPress={() =>
              tool.key === 'ask'
                ? router.push('/ask')
                : tool.key === 'attack'
                  ? router.push({ pathname: '/attack', params: { from: 'practice' } })
                  : router.push({ pathname: '/soon/[tool]', params: { tool: tool.key } })}
            testID={`practice-tool-${tool.key}`}
            style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
            <IconTile name={tool.icon} size={42} />
            <View style={styles.rowText}>
              <Text weight="semibold" style={styles.rowTitle}>
                {t(`nav.${tool.key}`)}
              </Text>
              <Text tone="faint" style={styles.rowMeta} numberOfLines={1}>
                {t(`navDesc.${tool.key}`)}
              </Text>
            </View>
            <Icon name="chevronRight" color={colors.tabInactive} size={20} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 14 },
  pressed: { opacity: 0.7 },
});
