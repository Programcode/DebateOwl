import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { ActionMenu } from './action-menu';
import type { HeaderAction, HeaderButton } from './document-header';
import { Icon } from './icon';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

/** The web preview has no native header, so it draws mock 03's bar and its menu. */
export function DocumentHeader({ backLabel, onShare, actions, buttons = [] }: { backLabel: string; onShare?: () => void; actions: HeaderAction[]; buttons?: HeaderButton[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <BouncePressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={() => router.back()} style={styles.back} testID="document-back">
        <Icon name="chevronLeft" color={colors.primary} size={26} />
        <Text style={[styles.backLabel, { color: colors.primary }]} numberOfLines={1}>
          {backLabel}
        </Text>
      </BouncePressable>
      <View style={styles.actions}>
        {buttons.map((button) => (
          <BouncePressable key={button.key} accessibilityRole="button" accessibilityLabel={button.label} onPress={button.onPress} hitSlop={8} style={styles.icon} testID={`document-${button.key}`}>
            <Icon name={button.icon} color={colors.primary} size={27} />
          </BouncePressable>
        ))}
        {onShare ? (
          <BouncePressable accessibilityRole="button" accessibilityLabel={t('mobile.results.share')} onPress={onShare} hitSlop={8} style={styles.icon}>
            <Icon name="share" color={colors.primary} size={25} />
          </BouncePressable>
        ) : null}
        {actions.length > 0 ? (
          <BouncePressable accessibilityRole="button" accessibilityLabel={t('nav.more')} onPress={() => setOpen(true)} hitSlop={8} style={styles.icon} testID="document-more">
            <Icon name="more" color={colors.primary} size={27} />
          </BouncePressable>
        ) : null}
      </View>
      <ActionMenu
        visible={open}
        placement="top"
        items={actions.map(({ key, label, icon, destructive }) => ({ key, label, icon, destructive }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setOpen(false)}
        onSelect={(key) => actions.find((action) => action.key === key)?.onPress()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, flexShrink: 1 },
  backLabel: { fontSize: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 8 },
  icon: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
