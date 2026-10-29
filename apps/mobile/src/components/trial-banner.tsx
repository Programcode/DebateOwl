import AsyncStorage from '@react-native-async-storage/async-storage';
import { trialDaysLeft } from '@debatelab/core/trial';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { Icon } from './icon';
import { Text } from './text';

import { useAuth } from '@/lib/auth';
import { fetchSubscription } from '@/lib/subscription';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const dismissedKey = (userId: string, endsAt: string) => `debatelab:trial-banner-dismissed:${userId}:${endsAt}`;

/** The trial's end date while a trial runs and the student has not hidden its reminder; read again on focus. */
function useTrialEnd(userId: string | null): { endsAt: string | null; dismiss: () => void } {
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let live = true;
      fetchSubscription(userId)
        .then(async (subscription) => {
          const end = subscription.billingState === 'trial' && subscription.billingDateKind === 'ends' ? subscription.billingDate : null;
          const hidden = end ? (await AsyncStorage.getItem(dismissedKey(userId, end))) === '1' : false;
          if (!live) return;
          setEndsAt(end);
          if (hidden && end) setDismissed(dismissedKey(userId, end));
        })
        // Offline or refused: no reminder, as when no trial runs.
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [userId]),
  );

  // Another account's trial never shows under this one.
  useEffect(() => setEndsAt(null), [userId]);

  const key = userId && endsAt ? dismissedKey(userId, endsAt) : null;
  return {
    endsAt: key && dismissed !== key ? endsAt : null,
    dismiss: () => {
      if (!key) return;
      setDismissed(key);
      AsyncStorage.setItem(key, '1').catch(() => undefined);
    },
  };
}

/**
 * The website's TrialBanner: "Free trial: 2 days left." while a trial runs.
 * Hiding it hides it for this trial on this device; a new end date shows it
 * again. Its next step is the plan in You, since upgrading waits for in-app purchase.
 */
export function TrialBanner({ style }: { style?: ViewStyle }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { endsAt, dismiss } = useTrialEnd(session?.user.id ?? null);
  const daysLeft = endsAt ? trialDaysLeft(endsAt) : null;
  if (daysLeft === null) return null;
  const message = daysLeft === 0 ? t('trialBanner.endsToday') : t('trialBanner.daysLeft', { count: daysLeft });

  return (
    <View
      accessibilityLabel={t('settings.tierTrial')}
      testID="trial-banner"
      style={[styles.banner, { backgroundColor: colors.tile, borderColor: colors.tileBorder }, style]}>
      <Icon name="timer" color={colors.primary} size={18} />
      <Text weight="medium" style={[styles.message, { color: colors.tileText }]}>
        {message}
      </Text>
      <BouncePressable
        accessibilityRole="button"
        onPress={() => router.navigate('/you')}
        hitSlop={6}
        style={[styles.action]}>
        <Text weight="semibold" style={[styles.actionText, { color: colors.primary }]}>
          {t('mobile.trialBanner.seePlan')}
        </Text>
      </BouncePressable>
      <BouncePressable
        accessibilityRole="button"
        accessibilityLabel={t('trialBanner.dismiss')}
        onPress={dismiss}
        hitSlop={8}
        testID="trial-banner-dismiss"
        style={[styles.dismiss]}>
        <Icon name="x" color={colors.tabInactive} size={18} />
      </BouncePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderWidth: 2, borderRadius: radius.card, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  message: { flex: 1, minWidth: 160, fontSize: 15, lineHeight: 20, paddingVertical: 4 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  actionText: { fontSize: 15 },
  dismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
