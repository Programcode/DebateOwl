import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, IconTile } from './card';
import { ScreenTitle } from './screen-title';
import { Screen } from './screen';
import { TABS } from './tabs';
import { Text } from './text';

/** An honest stand-in for a tab whose screens have not reached the app yet. */
export function PlaceholderScreen({ tab }: { tab: 'prepare' | 'practice' | 'library' }) {
  const { t } = useTranslation();
  const { icon, label } = TABS.find((entry) => entry.name === `(${tab})`)!;
  return (
    <Screen>
      <ScreenTitle title={t(label)} />
      <Card>
        <View style={styles.row}>
          <IconTile name={icon} />
          <Text weight="semibold" style={styles.title}>
            {t('mobile.placeholder.title')}
          </Text>
        </View>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.placeholder.body')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 17, flex: 1 },
  body: { fontSize: 15, lineHeight: 21 },
});
