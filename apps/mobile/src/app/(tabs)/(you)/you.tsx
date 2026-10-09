import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { supabaseEnv } from '@/lib/supabase-config';
import { useTheme } from '@/theme/use-theme';

/** Account and sign-out only. Settings and account deletion arrive with the You tab's own PR. */
export default function YouScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const [failed, setFailed] = useState(false);

  const handleSignOut = async () => {
    setFailed(false);
    try {
      await signOut();
    } catch {
      setFailed(true);
    }
  };

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.you')} />
      <Card>
        <View style={styles.row}>
          <IconTile name="user" />
          <View style={styles.account}>
            <Text tone="faint" style={styles.caption}>
              {t('settings.signedInAs')}
            </Text>
            <Text testID="account-email" weight="semibold" style={styles.email} numberOfLines={1}>
              {session?.user.email ?? ''}
            </Text>
          </View>
        </View>
        {supabaseEnv === 'staging' ? (
          <View style={[styles.badge, { backgroundColor: colors.tile }]}>
            <Text weight="semibold" style={[styles.badgeText, { color: colors.tileForeground }]}>
              {t('settings.stagingBanner')}
            </Text>
          </View>
        ) : null}
      </Card>
      <Card>
        <Text tone="secondary" style={styles.body}>
          {t('mobile.placeholder.body')}
        </Text>
      </Card>
      <TextButton label={t('settings.signOut')} destructive onPress={() => void handleSignOut()} />
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
          {t('settings.signOutFailed')}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  account: { flex: 1, gap: 2 },
  caption: { fontSize: 13 },
  email: { fontSize: 17 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13 },
  body: { fontSize: 15, lineHeight: 21 },
});
