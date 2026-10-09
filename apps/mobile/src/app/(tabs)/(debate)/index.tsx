import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';

/** Home. Until debates reach the app (next PR), a signed-in user sees the empty state. */
export default function DebateScreen() {
  const { t } = useTranslation();
  return (
    <Screen safeTop>
      <Text accessibilityRole="header" weight="bold" style={styles.title}>
        {t('debate.noCurrentTitle')}
      </Text>
      <Text tone="secondary" style={styles.body}>
        {t('debate.noCurrentDesc')}
      </Text>
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.debate.comingSoon')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, marginTop: 8 },
  body: { fontSize: 16, lineHeight: 22 },
});
