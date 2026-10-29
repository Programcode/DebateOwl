import type { FeatureTab } from '@debatelab/core/ai/feature-configs';
import { DEFAULT_MODEL } from '@debatelab/core/contract/model-catalog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { runRequest } from '@/lib/run-request';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Owl } from '@/components/owl';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { isProOnlyModel } from '@/lib/feature-config';
import { LIMIT_TITLES, limitMessage, limitVariant } from '@/lib/refusal';
import { useSettings } from '@/lib/settings';
import { storeKit } from '@/lib/store-kit';
import { fetchSubscription, type Subscription } from '@/lib/subscription';

const FEATURES = new Set<FeatureTab>(['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'sparring']);
const number = (value: string | undefined) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined);

/**
 * The website's limit-reached and model-restricted dialogs as a sheet, with
 * its words and next steps. Where the website offers Pro, the sheet opens the
 * App Store plans (plans.tsx), or the plan in You in a build without StoreKit; a paid plan's
 * daily cap and the weekly allowance only say when access returns, as there.
 */
export default function LimitSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; feature?: string; code?: string; limit?: string; current?: string; units?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { readFeatureConfig, setFeatureConfig } = useSettings();
  const [plan, setPlan] = useState<Subscription | null>(null);
  const [switching, setSwitching] = useState(false);

  // The plan decides the next step (a paid daily cap is not sold Pro again) and the end date.
  useEffect(() => {
    if (!userId || params.kind === 'model') return;
    let active = true;
    fetchSubscription(userId)
      .then((next) => {
        if (active) setPlan(next);
      })
      .catch((cause: unknown) => console.warn('Could not load the plan:', cause instanceof Error ? cause.message : cause));
    return () => {
      active = false;
    };
  }, [userId, params.kind]);

  const close = () => router.back();
  // With in-app purchase the next step is the plans themselves; otherwise the plan in You.
  const canBuy = storeKit() !== null;
  const seePlan = () => {
    router.back();
    if (canBuy) router.push('/plans');
    else router.navigate('/you');
  };
  const seePlanLabel = canBuy ? t('mobile.plans.see') : t('mobile.ask.openYou');

  if (params.kind === 'model') {
    const feature = FEATURES.has(params.feature as FeatureTab) ? (params.feature as FeatureTab) : null;
    // The website only closes its dialog. Here the tool moves to what the plan allows, so the
    // retry is not refused again: low reasoning, and the free default when its model is Pro-only.
    const switchToLow = async () => {
      if (!feature || !userId) return close();
      setSwitching(true);
      await runRequest(async () => {
        const current = await readFeatureConfig(userId, feature);
        await setFeatureConfig(feature, isProOnlyModel(current.model) ? { model: DEFAULT_MODEL, reasoningEffort: 'low' } : { reasoningEffort: 'low' });
      }, async (cause) => {
        console.warn('Could not switch to low reasoning:', cause instanceof Error ? cause.message : cause);
      });
      close();
    };
    return (
      <SheetScrollView testID="limit-sheet">
        <View style={styles.head}>
          <Owl pose="coach" size={92} />
          <Text accessibilityRole="header" weight="display" style={styles.title}>
            {t('modelModal.title')}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {`${t('modelModal.description')} ${t('modelModal.upgradeNote')}`}
          </Text>
        </View>
        <PrimaryButton label={t('modelModal.useFree')} busy={switching} onPress={() => void switchToLow()} testID="limit-primary" />
        <View style={styles.secondary}>
          <TextButton label={seePlanLabel} onPress={seePlan} />
        </View>
      </SheetScrollView>
    );
  }

  const variant = limitVariant(params.code);
  const details = { code: params.code, limit: number(params.limit), current: number(params.current), units: number(params.units) };
  const paidDailyCap = variant === 'limit_reached' && (plan?.billingState === 'pro' || plan?.billingState === 'pro_canceling' || plan?.billingState === 'payment_failed');
  const endedOn = variant === 'subscription_ended' && plan?.billingState === 'subscription_ended' && plan.billingDate ? formatDate(plan.billingDate) : null;
  const description = endedOn ? t('limitModal.subscriptionEndedOnDesc', { date: endedOn }) : limitMessage(t, details);
  const waitOnly = variant === 'weekly_budget_reached' || paidDailyCap;
  const waiting = variant === 'limit_reached' || variant === 'weekly_budget_reached';

  return (
    <SheetScrollView testID="limit-sheet">
      <View style={styles.head}>
        <Owl pose={waiting ? 'sleepy' : 'surprised'} size={92} />
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t(LIMIT_TITLES[variant])}
        </Text>
        <Text tone="secondary" style={styles.body}>
          {description}
        </Text>
      </View>
      {waitOnly ? (
        <PrimaryButton label={variant === 'weekly_budget_reached' ? t('limitModal.ok') : t('limitModal.gotIt')} onPress={close} testID="limit-primary" />
      ) : (
        <>
          <PrimaryButton label={seePlanLabel} onPress={seePlan} testID="limit-primary" />
          <View style={styles.secondary}>
            <TextButton label={t('limitModal.notNow')} onPress={close} />
          </View>
          {variant !== 'payment_failed' ? (
            <Text tone="faint" style={styles.note}>
              {t('limitModal.upgradeNote')}
            </Text>
          ) : null}
        </>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 8, paddingTop: 4 },
  title: { fontSize: 22, lineHeight: 28, textAlign: 'center', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  secondary: { alignItems: 'center', marginTop: -6 },
  note: { fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: -8 },
});
