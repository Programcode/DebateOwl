import { APP_LANGUAGES, type AppLanguage } from '@debatelab/core/languages';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { useSettings, type ThemePreference } from '@/lib/settings';
import { fetchSubscription, type Subscription, type SubscriptionTier } from '@/lib/subscription';
import { supabaseEnv } from '@/lib/supabase-config';
import { useTheme } from '@/theme/use-theme';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  trial: 'settings.tierTrial',
  pro: 'settings.tierPro',
  legacy_free: 'settings.tierLegacyFree',
  expired: 'settings.tierExpired',
};

const LANGUAGE_OPTIONS = (Object.keys(APP_LANGUAGES) as AppLanguage[]).map((value) => ({
  value,
  label: APP_LANGUAGES[value].label,
}));

/** Plan, settings shared with the website, and the account. Download my data is not in the app yet. */
export default function YouScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const settings = useSettings();
  const [saveFailed, setSaveFailed] = useState(false);

  const save = (change: () => Promise<void>) => {
    setSaveFailed(false);
    change().catch((cause: unknown) => {
      console.warn('Could not save settings:', cause instanceof Error ? cause.message : cause);
      setSaveFailed(true);
    });
  };

  return (
    <Screen>
      <ScreenTitle title={t('mobile.tabs.you')} />

      <SubscriptionCard userId={session?.user.id} />

      <Text accessibilityRole="header" weight="bold" style={styles.section}>
        {t('settings.globalSettings')}
      </Text>
      <Card>
        <Setting label={t('settings.uiLanguage')}>
          <SegmentedControl
            options={LANGUAGE_OPTIONS}
            value={settings.language}
            onChange={(value) => save(() => settings.setLanguage(value))}
          />
        </Setting>
        <Setting label={t('settings.outputLanguage')}>
          <SegmentedControl
            options={LANGUAGE_OPTIONS}
            value={settings.outputLanguage}
            onChange={(value) => save(() => settings.setOutputLanguage(value))}
          />
        </Setting>
        <Setting label={t('settings.theme')}>
          <SegmentedControl<ThemePreference>
            options={[
              { value: 'light', label: t('settings.light') },
              { value: 'dark', label: t('settings.dark') },
              { value: 'system', label: t('settings.system') },
            ]}
            value={settings.theme}
            onChange={(value) => save(() => settings.setTheme(value))}
          />
        </Setting>
        {saveFailed ? (
          <Text accessibilityRole="alert" weight="medium" style={[styles.small, { color: colors.destructive }]}>
            {t('mobile.you.saveFailed')}
          </Text>
        ) : null}
      </Card>

      <Text accessibilityRole="header" weight="bold" style={styles.section}>
        {t('settings.account')}
      </Text>
      <Card style={styles.list}>
        <View style={[styles.row, styles.account]}>
          <IconTile name="user" />
          <View style={styles.rowText}>
            <Text tone="faint" style={styles.small}>
              {t('settings.signedInAs')}
            </Text>
            <Text testID="account-email" weight="semibold" style={styles.email} numberOfLines={1}>
              {session?.user.email ?? ''}
            </Text>
            {supabaseEnv === 'staging' ? (
              <View style={[styles.badge, { backgroundColor: colors.tile }]}>
                <Text weight="semibold" style={[styles.badgeText, { color: colors.tileForeground }]}>
                  {t('settings.stagingBanner')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/delete-account')}
          style={({ pressed }) => [styles.row, { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
          <View style={styles.rowText}>
            <Text weight="semibold" style={[styles.rowTitle, { color: colors.destructive }]}>
              {t('settings.deleteAccount')}
            </Text>
            <Text tone="faint" style={styles.small}>
              {t('settings.deleteAccountDesc')}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </Pressable>
      </Card>

      <TextButton label={t('settings.signOut')} destructive onPress={() => void signOut()} />
    </Screen>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.setting}>
      <Text weight="medium" tone="secondary" style={styles.settingLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function SubscriptionCard({ userId }: { userId: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    if (!userId) return;
    try {
      const next = await fetchSubscription(userId);
      if (!isCurrent()) return;
      setSubscription(next);
      setFailed(false);
    } catch (cause) {
      if (!isCurrent()) return;
      console.warn('Could not load the subscription:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    }
  }, [userId]);

  // Usage changes as the student works, so read it again whenever You comes into view.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  return (
    <Card>
      <View style={styles.planHeader}>
        <IconTile name="sparkles" />
        <Text weight="semibold" style={styles.planTitle}>
          {t('settings.subscription')}
        </Text>
        {subscription ? (
          <View style={[styles.badge, { backgroundColor: subscription.tier === 'expired' ? colors.segmentTrack : colors.tile }]}>
            <Text
              weight="semibold"
              style={[styles.badgeText, { color: subscription.tier === 'expired' ? colors.secondary : colors.tileForeground }]}
              testID="subscription-tier">
              {t(TIER_LABELS[subscription.tier])}
            </Text>
          </View>
        ) : null}
      </View>
      {failed && !subscription ? (
        <>
          <Text tone="secondary" style={styles.small}>
            {t('mobile.you.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load(() => true)} />
        </>
      ) : !subscription ? (
        <View style={styles.loadingRow} accessibilityRole="progressbar">
          <ActivityIndicator />
          <Text tone="secondary" style={styles.small}>
            {t('settings.loading')}
          </Text>
        </View>
      ) : (
        <View style={styles.planBody}>
          {subscription.tier === 'trial' && subscription.trialEndsAt ? (
            <Text tone="secondary" style={styles.small}>
              {t('settings.ends')} {formatDate(subscription.trialEndsAt)}
            </Text>
          ) : null}
          <Text weight="medium" style={styles.usage}>
            {t('mobile.you.usage', { used: subscription.dailyUsed, limit: subscription.dailyLimit })}
          </Text>
          <Text tone="secondary" style={styles.small}>
            {t(subscription.tier === 'expired' ? 'settings.accessExpired' : 'settings.accessActive')}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 18.5, lineHeight: 24, letterSpacing: -0.2, marginTop: 6, marginBottom: -6, marginHorizontal: 2 },
  small: { fontSize: 14, lineHeight: 19 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planTitle: { flex: 1, fontSize: 17 },
  planBody: { gap: 4 },
  usage: { fontSize: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13 },
  setting: { gap: 7 },
  settingLabel: { fontSize: 14, marginLeft: 2 },
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  account: { alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16 },
  email: { fontSize: 17 },
  pressed: { opacity: 0.6 },
});
