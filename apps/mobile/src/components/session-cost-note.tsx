import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';

import { limitMessage } from '@/lib/refusal';
import { sessionQuotaRemaining, type SessionQuota } from '@/lib/session-quota';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * The website's SessionCostNote: "This round costs 1 AI use, however many
 * turns it takes. You have N left today." When the round would be refused,
 * why, in the limit dialog's words. Nothing while the cost is unknown.
 */
export function SessionCostNote({ quota }: { quota: SessionQuota | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!quota) return null;
  if (!quota.allowed) {
    const reason = quota.code === 'upgrade_required' ? t('modelModal.restrictedDesc') : limitMessage(t, quota);
    return (
      <View accessibilityRole="alert" style={[styles.blocked, { borderColor: colors.warning }]} testID="session-cost">
        <Icon name="alert" color={colors.warning} size={18} />
        <Text style={[styles.blockedText, { color: colors.warning }]}>{reason}</Text>
      </View>
    );
  }
  const remaining = sessionQuotaRemaining(quota);
  return (
    <Text tone="faint" style={styles.note} testID="session-cost">
      {t('sessionQuota.cost', { count: quota.units })}
      {remaining !== null ? ` ${t('sessionQuota.remaining', { count: remaining })}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 14, lineHeight: 20, marginHorizontal: 4 },
  blocked: { flexDirection: 'row', gap: 8, borderWidth: 2, borderRadius: radius.field, paddingHorizontal: 12, paddingVertical: 10 },
  blockedText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
});
