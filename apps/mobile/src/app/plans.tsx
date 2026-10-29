import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Icon } from '@/components/icon';
import { Owl } from '@/components/owl';
import { SheetScrollView } from '@/components/sheet';
import { SuccessCheck } from '@/components/success-check';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { buy, loadProducts, manageSubscriptions, restore, type PurchaseOutcome, type PurchaseTier } from '@/lib/purchases';
import type { StoreProduct, SubscriptionPeriod } from '@/lib/store-kit';
import { websitePage } from '@/lib/website';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Notice = { tone: 'success' | 'info' | 'error'; text: string } | null;

// The server's daily limits for each plan (supabase/functions/_shared/usage-limits.ts).
const DAILY_USES: Record<PurchaseTier, number> = { basic: 20, pro: 50 };

/**
 * Basic and Pro through the App Store (purchases.ts): prices in the
 * student's own currency from StoreKit, Subscribe, Restore and Manage
 * subscription, and the renewal terms App Review asks for beside the
 * button. The server applies a purchase to the signed-in account; until App
 * Store Connect and the server are set up (docs/apple-platform.md), the
 * screen says purchases are not available yet.
 */
export default function PlansSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [products, setProducts] = useState<Record<PurchaseTier, StoreProduct> | null | undefined>(undefined);
  const [tier, setTier] = useState<PurchaseTier>('pro');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // A purchase can finish after the sheet closed; it then changes nothing on screen.
  const mounted = useRef(true);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    mounted.current = false;
    if (closing.current) clearTimeout(closing.current);
  }, []);

  useEffect(() => {
    let live = true;
    loadProducts()
      .then((next) => {
        if (live) setProducts(next);
      })
      .catch((cause: unknown) => {
        console.warn('Could not load the App Store products:', cause instanceof Error ? cause.message : cause);
        if (live) setProducts(null);
      });
    return () => {
      live = false;
    };
  }, []);

  // "a month" after a price; "1 week" for how long an introductory offer lasts.
  const period = (value: SubscriptionPeriod) => t(`mobile.plans.period.${value.unit}`, { count: value.value });
  const length = (value: SubscriptionPeriod, periods = 1) => t(`mobile.plans.length.${value.unit}`, { count: value.value * periods });

  const outcomeNotice = (outcome: PurchaseOutcome): Notice => {
    switch (outcome.kind) {
      case 'purchased':
        return { tone: 'success', text: t('mobile.plans.purchased') };
      case 'pending':
        return { tone: 'info', text: t('mobile.plans.pending') };
      case 'cancelled':
        return null;
      case 'unavailable':
        return { tone: 'info', text: t('mobile.plans.unavailable') };
      case 'failed':
        return { tone: 'error', text: t(outcome.reason === 'network' ? 'mobile.plans.offline' : outcome.reason === 'accountChanged' ? 'mobile.plans.accountChanged' : 'mobile.plans.failed') };
    }
  };

  const subscribe = async () => {
    if (!userId || busy) return;
    setBusy('buy');
    setNotice(null);
    const outcome = await buy(tier, userId);
    if (!mounted.current) return;
    setBusy(null);
    setNotice(outcomeNotice(outcome));
    if (outcome.kind === 'purchased') {
      haptics.success();
      closing.current = setTimeout(() => {
        if (mounted.current) router.back();
      }, 1_400);
    } else if (outcome.kind === 'failed') {
      haptics.warning();
    }
  };

  const restorePurchases = async () => {
    if (!userId || busy) return;
    setBusy('restore');
    setNotice(null);
    const outcome = await restore(userId);
    if (!mounted.current) return;
    setBusy(null);
    if (outcome.kind === 'restored') {
      if (outcome.applied > 0) haptics.success();
      setNotice(
        outcome.applied > 0
          ? { tone: 'success', text: t('mobile.plans.restored') }
          : { tone: 'info', text: t(outcome.otherAccount > 0 ? 'mobile.plans.restoredOtherAccount' : 'mobile.plans.nothingToRestore') },
      );
    } else if (outcome.kind === 'unavailable') {
      setNotice({ tone: 'info', text: t('mobile.plans.unavailable') });
    } else if (outcome.kind === 'failed') {
      setNotice({ tone: 'error', text: t(outcome.reason === 'network' ? 'mobile.plans.offline' : 'mobile.plans.failed') });
    }
  };

  const plan = (key: PurchaseTier) => {
    const product = products?.[key];
    const selected = key === tier;
    const features = key === 'pro'
      ? [t('mobile.plans.dailyUses', { count: DAILY_USES.pro }), t('pricingModal.proFeature2'), t('pricingModal.proFeature3'), t('pricingModal.proFeature5')]
      : [t('mobile.plans.dailyUses', { count: DAILY_USES.basic }), t('pricingModal.freeFeature2'), t('pricingModal.proFeature5')];
    const intro = product?.introOffer && product.isEligibleForIntroOffer ? product.introOffer : null;
    return (
      <BouncePressable
        key={key}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => {
          if (!selected) haptics.select();
          setTier(key);
        }}
        testID={`plan-${key}`}
        style={[styles.plan, { backgroundColor: colors.card, borderColor: selected ? colors.primaryFill : colors.border }]}>
        <View style={styles.planHead}>
          <Text weight="display" style={styles.planName}>
            {product?.displayName || t(key === 'pro' ? 'settings.tierPro' : 'settings.tierBasic')}
          </Text>
          {key === 'pro' ? (
            <View style={[styles.badge, { backgroundColor: colors.tile }]}>
              <Text weight="bold" style={[styles.badgeText, { color: colors.tileForeground }]}>
                {t('pricingModal.recommended')}
              </Text>
            </View>
          ) : null}
          <View style={styles.flex} />
          <View style={[styles.radio, { borderColor: selected ? colors.primaryFill : colors.borderStrong, backgroundColor: selected ? colors.primaryFill : 'transparent' }]}>
            {selected ? <Icon name="check" color={colors.onPrimary} size={14} /> : null}
          </View>
        </View>
        {product ? (
          <Text weight="semibold" style={styles.price}>
            {product.period ? `${product.displayPrice} ${period(product.period)}` : product.displayPrice}
          </Text>
        ) : null}
        {intro ? (
          <Text tone="secondary" style={styles.small}>
            {intro.paymentMode === 'freeTrial'
              ? t('mobile.plans.freeTrial', { period: length(intro.period, intro.periodCount) })
              : t('mobile.plans.introPrice', {
                  // Pay as you go is a price per period; pay up front is one price for the whole offer.
                  price: intro.paymentMode === 'payAsYouGo' ? `${intro.displayPrice} ${period(intro.period)}` : intro.displayPrice,
                  period: length(intro.period, intro.periodCount),
                })}
          </Text>
        ) : null}
        <View style={styles.features}>
          {features.map((feature) => (
            <View key={feature} style={styles.feature}>
              {/* Mint with a check mark, as success always is. */}
              <Icon name="check" color={colors.success} size={16} />
              <Text style={[styles.small, styles.flex]}>{feature}</Text>
            </View>
          ))}
        </View>
      </BouncePressable>
    );
  };

  const selected = products?.[tier];
  return (
    <SheetScrollView testID="plans-sheet">
      <View style={styles.head}>
        <Owl pose="celebrating" size={96} gesture="hop" />
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('mobile.plans.title')}
        </Text>
        <Text tone="secondary" style={styles.body}>
          {t('pricingModal.subtitle')}
        </Text>
      </View>

      {plan('pro')}
      {plan('basic')}

      {products === null ? (
        <Text tone="secondary" style={[styles.small, styles.center]}>
          {t('mobile.plans.unavailable')}
        </Text>
      ) : null}

      <PrimaryButton
        label={selected ? t('mobile.plans.subscribeFor', { price: selected.displayPrice }) : t('pricing.subscribe')}
        busy={busy === 'buy'}
        disabled={!products || busy !== null}
        onPress={() => void subscribe()}
        testID="plans-subscribe"
      />

      {notice ? (
        <View style={styles.notice} accessibilityRole="alert">
          {notice.tone === 'success' ? <SuccessCheck size={20} /> : null}
          <Text
            weight="medium"
            style={[styles.small, styles.flex, { color: notice.tone === 'success' ? colors.success : notice.tone === 'error' ? colors.destructive : colors.secondary }]}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      {/* What App Review asks to see beside an auto-renewing subscription. */}
      <Text tone="faint" style={styles.terms}>
        {t('mobile.plans.renewalTerms')}
      </Text>

      <View style={styles.links}>
        <TextButton label={t('mobile.plans.restore')} disabled={busy !== null} onPress={() => void restorePurchases()} />
        <TextButton label={t('mobile.plans.manage')} disabled={busy !== null} onPress={() => void manageSubscriptions()} />
        <View style={styles.legal}>
          <TextButton label={t('footer.terms')} onPress={() => void WebBrowser.openBrowserAsync(websitePage('/terms'))} />
          <TextButton label={t('footer.privacy')} onPress={() => void WebBrowser.openBrowserAsync(websitePage('/privacy'))} />
        </View>
      </View>
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 8, paddingTop: 4 },
  title: { fontSize: 24, lineHeight: 30, textAlign: 'center', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  plan: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 6 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 20, lineHeight: 25 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 12 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  price: { fontSize: 17, lineHeight: 23 },
  features: { gap: 6, marginTop: 4 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  small: { fontSize: 14.5, lineHeight: 20 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  terms: { fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  links: { alignItems: 'center', gap: 0 },
  legal: { flexDirection: 'row', gap: 12 },
});
