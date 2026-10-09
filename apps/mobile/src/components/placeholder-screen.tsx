import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, IconTile } from './card';
import type { IconName } from './icon-paths';
import { ScreenTitle } from './screen-title';
import { Screen } from './screen';
import { TABS } from './tabs';
import { Text } from './text';

/** An honest stand-in for a tab, or a tool in it, whose screens have not reached the app yet. */
export function PlaceholderScreen({ tab, title, icon }: { tab: 'prepare' | 'practice'; title?: string; icon?: IconName }) {
  const { t } = useTranslation();
  const entry = TABS.find((item) => item.name === `(${tab})`)!;
  return (
    <Screen>
      <ScreenTitle title={title ?? t(entry.label)} />
      <Card>
        <View style={styles.row}>
          <IconTile name={icon ?? entry.icon} />
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
