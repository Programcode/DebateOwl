import type { BillingDateKind, BillingStateName } from '@debatelab/core/contract/billing-state';
import { APP_LANGUAGES, type AppLanguage } from '@debatelab/core/languages';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { runRequest } from '@/lib/run-request';
import { TextButton } from '@/components/buttons';
import { Card, IconTile, usePressScale } from '@/components/card';
import { SwitchRow } from '@/components/form-rows';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { ScreenTitle } from '@/components/screen-title';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Skeleton } from '@/components/skeleton';
import { Text } from '@/components/text';
import { exportAccountData } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { showNotice } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { shareJson } from '@/lib/export';
import { disablePush, enablePush, readPushState, type PushState } from '@/lib/push';
import { createPushSwitch, type PushSwitchView } from '@/lib/push-switch';
import { useSettings, type ThemePreference } from '@/lib/settings';
import { storeKit } from '@/lib/store-kit';
import { fetchSubscription, type Subscription } from '@/lib/subscription';
import { supabaseEnv } from '@/lib/supabase-config';
import { websitePage } from '@/lib/website';
import { useTheme } from '@/theme/use-theme';
import { dailyResetTime } from '@/lib/usage';
import { signInMethodKey } from '@/lib/sign-in-method';

type BadgeTone = 'plan' | 'pro' | 'good' | 'bad';

/** The website's plan badges (SubscriptionStatus.tsx): the state's label in its tint; mint ones carry a check mark. */
const STATE_BADGES: Record<BillingStateName, { labelKey: string; tone: BadgeTone }> = {
  trial: { labelKey: 'settings.tierTrial', tone: 'plan' },
  extended_access: { labelKey: 'settings.tierExtended', tone: 'good' },
  pro: { labelKey: 'settings.tierPro', tone: 'pro' },
  pro_canceling: { labelKey: 'settings.tierPro', tone: 'pro' },
  basic: { labelKey: 'settings.tierBasic', tone: 'plan' },
  payment_failed: { labelKey: 'settings.tierPaymentFailed', tone: 'bad' },
  legacy_free: { labelKey: 'settings.tierLegacyFree', tone: 'good' },
  trial_ended: { labelKey: 'settings.tierExpired', tone: 'bad' },
  subscription_ended: { labelKey: 'settings.tierExpired', tone: 'bad' },
};

const DATE_LABELS: Partial<Record<BillingDateKind, string>> = {
  ends: 'settings.endsOn',
  renews: 'settings.renewsOn',
  cancels: 'settings.cancelsOn',
};

/** What the state means, in the website's words. */
function planDescription(t: TFunction, subscription: Subscription): string {
  const date = subscription.billingDate ? formatDate(subscription.billingDate) : null;
  switch (subscription.billingState) {
    case 'extended_access':
      return t('settings.extendedAccessDesc', { count: subscription.dailyLimit });
    case 'payment_failed':
      return subscription.billingDateKind === 'grace_ends' && date
        ? `${t('settings.paymentFailedDesc')} ${t('settings.paymentGraceUntil', { date })}`
        : t('settings.paymentFailedNoAccess');
    case 'subscription_ended':
      return date ? t('settings.subscriptionEndedOn', { date }) : t('settings.subscriptionEnded');
    case 'trial_ended':
      return t('settings.accessExpired');
    default:
      return t('settings.accessActive');
  }
}

const LANGUAGE_OPTIONS = (Object.keys(APP_LANGUAGES) as AppLanguage[]).map((value) => ({
  value,
  label: APP_LANGUAGES[value].label,
}));

/** Plan, History, settings shared with the website, the account and its data, and the website's Terms and Privacy. */
export default function YouScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const settings = useSettings();
  const signInMethod = signInMethodKey(session?.user ?? null);
  const [saveFailed, setSaveFailed] = useState(false);

  const [exporting, setExporting] = useState(false);
  // A download started for one account is not shared after an account change or after leaving.
  const owner = useRef(session?.user.id ?? null);
  const live = useRef(true);
  useEffect(() => {
    owner.current = session?.user.id ?? null;
  }, [session?.user.id]);
  useEffect(() => () => {
    live.current = false;
  }, []);

  // The website's Download my data: the account function's export, as debatelab-data-<date>.json, to the share sheet.
  const download = async () => {
    const forUser = owner.current;
    if (!forUser || exporting) return;
    setExporting(true);
    return await runRequest(async () => {
      const { fileName, json } = await exportAccountData();
      if (!live.current || owner.current !== forUser) return;
      await shareJson(json, fileName, t('settings.downloadData'));
    }, async (cause) => {
      console.warn('Could not download the data:', cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === forUser) showNotice(t('settings.downloadDataFailed'));
    }, () => {
      if (live.current) setExporting(false);
    });
  };

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

      <SubscriptionCard key={session?.user.id} userId={session?.user.id} />

      <Card style={styles.list}>
        <PressRow
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/history', params: { from: 'you' } })}
          testID="you-history">
          <IconTile name="history" />
          <View style={styles.rowText}>
            <Text weight="semibold" style={styles.rowTitle}>
              {t('nav.history')}
            </Text>
            <Text tone="faint" style={styles.small}>
              {t('mobile.you.historyDesc')}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </PressRow>
      </Card>

      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
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

      <NotificationsCard userId={session?.user.id} />

      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
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
            {signInMethod ? <Text tone="faint" style={styles.small}>{t(signInMethod)}</Text> : null}
            {supabaseEnv === 'staging' ? (
              <View style={[styles.badge, { backgroundColor: colors.tile }]}>
                <Text weight="semibold" style={[styles.badgeText, { color: colors.tileForeground }]}>
                  {t('settings.stagingBanner')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <PressRow
          accessibilityRole="button"
          accessibilityState={{ busy: exporting }}
          disabled={exporting}
          onPress={() => void download()}
          testID="you-download-data"
          divider>
          <IconTile name="download" />
          <View style={styles.rowText}>
            <Text weight="semibold" style={styles.rowTitle}>
              {exporting ? t('settings.downloadingData') : t('settings.downloadData')}
            </Text>
            <Text tone="faint" style={styles.small}>
              {t('settings.yourDataDesc')}
            </Text>
          </View>
          {/* Busy inside its own row, so it keeps the spinner. */}
          {exporting ? <ActivityIndicator /> : null}
        </PressRow>
      </Card>

      <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.section}>
        {t('settings.dangerZone')}
      </Text>
      <Card style={styles.list}>
        <PressRow accessibilityRole="button" onPress={() => router.push('/delete-data')} testID="you-delete-data">
          <View style={styles.rowText}>
            <Text weight="semibold" style={[styles.rowTitle, { color: colors.destructive }]}>
              {t('settings.deleteAllData')}
            </Text>
            <Text tone="faint" style={styles.small}>
              {t('mobile.you.deleteDataDesc')}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </PressRow>
        <PressRow accessibilityRole="button" onPress={() => router.push('/delete-account')} divider>
          <View style={styles.rowText}>
            <Text weight="semibold" style={[styles.rowTitle, { color: colors.destructive }]}>
              {t('settings.deleteAccount')}
            </Text>
            <Text tone="faint" style={styles.small}>
              {t('settings.deleteAccountDesc')}
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.tabInactive} size={20} />
        </PressRow>
      </Card>

      <Card style={styles.list}>
        <LinkRow icon="shield" label={t('footer.privacy')} url={websitePage('/privacy')} first />
        <LinkRow icon="file" label={t('footer.terms')} url={websitePage('/terms')} />
      </Card>

      <TextButton label={t('settings.signOut')} destructive onPress={() => void signOut()} />
    </Screen>
  );
}

/** A page of the website, opened in the in-app browser. */
function LinkRow({ icon, label, url, first }: { icon: IconName; label: string; url: string; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressRow accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(url)} divider={!first}>
      <IconTile name={icon} />
      <Text weight="semibold" style={[styles.rowTitle, styles.rowText]}>
        {label}
      </Text>
      <Icon name="externalLink" color={colors.tabInactive} size={19} />
    </PressRow>
  );
}

/** A row in a card that presses in under the finger; its divider stays put. */
function PressRow({ divider = false, children, ...props }: Omit<PressableProps, 'style' | 'children'> & { divider?: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const press = usePressScale();
  return (
    <Pressable {...props} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={divider ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
      {() => <Animated.View style={[styles.row, press.style]}>{children}</Animated.View>}
    </Pressable>
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

const PUSH_DESCRIPTIONS: Record<PushState, string> = {
  on: 'mobile.you.notifications.description',
  off: 'mobile.you.notifications.description',
  blocked: 'mobile.you.notifications.blocked',
  unavailable: 'mobile.you.notifications.unavailable',
};

/** Push notifications for this account on this phone (lib/push.ts). */
function NotificationsCard({ userId }: { userId: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = useSettings();
  const [{ state, busy, failed }, setView] = useState<PushSwitchView>({ state: null, busy: false, failed: false });
  const [pushSwitch] = useState(() => createPushSwitch((patch) => setView((view) => ({ ...view, ...patch }))));

  const load = useCallback(() => {
    if (userId) pushSwitch.load(() => readPushState(userId));
  }, [userId, pushSwitch]);

  // The switch may have changed in iOS Settings while DebateLab was in the background.
  useFocusEffect(load);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    return () => subscription.remove();
  }, [load]);

  const change = (on: boolean) => {
    if (!userId) return;
    pushSwitch.change(() => (on ? enablePush(userId, language) : disablePush(userId).then((): PushState => 'off')));
  };

  return (
    <Card style={styles.list}>
      <SwitchRow
        first
        label={t('mobile.you.notifications.title')}
        description={t(PUSH_DESCRIPTIONS[state ?? 'off'])}
        value={state === 'on'}
        onChange={change}
        disabled={busy || state === null || state === 'unavailable' || state === 'blocked'}
      />
      {state === 'blocked' ? (
        <View style={styles.inset}>
          <TextButton label={t('mobile.you.notifications.openSettings')} onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.small, styles.inset, { color: colors.destructive }]}>
          {t('mobile.you.notifications.failed')}
        </Text>
      ) : null}
    </Card>
  );
}

function PlanBadge({ state }: { state: BillingStateName }) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { labelKey, tone } = STATE_BADGES[state];
  // The website's outline badges: the state's colour at 15% behind, 30% as the edge, and a darker text.
  const look = {
    plan: { tint: '30,141,251', color: dark ? '#7CC0FE' : '#0342A8' },
    pro: { tint: '243,154,0', color: dark ? '#FFD95A' : '#7A4405' },
    good: { tint: dark ? '47,211,154' : '20,179,125', color: colors.success },
    bad: { tint: dark ? '255,107,112' : '210,50,57', color: colors.destructive },
  }[tone];
  const background = `rgba(${look.tint},${tone === 'bad' ? 0.1 : 0.15})`;
  const border = `rgba(${look.tint},0.3)`;
  return (
    <View style={[styles.badge, { backgroundColor: background, borderColor: border }]}>
      {tone === 'good' ? <Icon name="check" color={look.color} size={13} /> : null}
      <Text weight="bold" style={[styles.badgeText, { color: look.color }]} testID="subscription-tier">
        {t(labelKey)}
      </Text>
    </View>
  );
}

function SubscriptionCard({ userId }: { userId: string | undefined }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const canBuy = storeKit() !== null;
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    if (!userId) return;
    return await runRequest(async () => {
      const next = await fetchSubscription(userId);
      if (!isCurrent()) return;
      setSubscription(next);
      setFailed(false);
    }, async (cause) => {
      if (!isCurrent()) return;
      console.warn('Could not load the subscription:', cause instanceof Error ? cause.message : cause);
      setFailed(true);
    });
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
        {subscription ? <PlanBadge state={subscription.billingState} /> : null}
      </View>
      {failed && !subscription ? (
        <>
          <Text tone="secondary" style={styles.small}>
            {t('mobile.you.loadFailed')}
          </Text>
          <TextButton label={t('common.retry')} onPress={() => void load(() => true)} />
        </>
      ) : !subscription ? (
        // The plan's lines loading in their own shape; "Loading" is what VoiceOver reads.
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('settings.loading')} style={styles.planBody}>
          <Skeleton width="46%" height={16} style={styles.planShape} />
          <Skeleton width="88%" height={12} style={styles.planShape} />
        </View>
      ) : (
        <View style={styles.planBody}>
          {subscription.billingDate && subscription.billingDateKind && DATE_LABELS[subscription.billingDateKind] ? (
            <Text tone="secondary" style={styles.small} testID="billing-date">
              {t(DATE_LABELS[subscription.billingDateKind]!, { date: formatDate(subscription.billingDate) })}
            </Text>
          ) : null}
          {subscription.dailyUsed !== null && subscription.dailyLimit > 0 ? (
            <Text weight="medium" style={styles.usage}>
              {t('dailyLimit.remainingWithReset', { count: Math.max(0, subscription.dailyLimit - subscription.dailyUsed), limit: subscription.dailyLimit, time: dailyResetTime(i18n.language) })}
            </Text>
          ) : null}
          <Text tone="secondary" style={styles.small}>
            {planDescription(t, subscription)}
          </Text>
          {subscription.hasOpenStripeSubscription ? (
            <TextButton label={t('mobile.you.manageWebsiteSubscription')} onPress={() => void WebBrowser.openBrowserAsync(websitePage('/app/settings')).catch(() => showNotice(t('common.error')))} />
          ) : null}
          {/* Basic and Pro through the App Store, where the build has StoreKit (plans.tsx). */}
          {canBuy ? <TextButton label={t('mobile.plans.see')} onPress={() => router.push('/plans')} /> : null}
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
  planShape: { marginVertical: 3 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13 },
  setting: { gap: 7 },
  settingLabel: { fontSize: 14, marginLeft: 2 },
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  account: { alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16 },
  email: { fontSize: 17 },
  inset: { paddingHorizontal: 16, paddingBottom: 12 },
});
