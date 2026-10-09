import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';

/** Account and settings arrive with sign-in and the You tab's own PR. */
export default function YouScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.you')} />
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.placeholder.body')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 21 },
});
