import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icon-paths';

import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

/** The mocks' pale-blue icon tile. */
export function IconTile({ name, size = 40 }: { name: IconName; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: colors.tile }]}>
      <Icon name={name} color={colors.tileForeground} size={Math.round(size * 0.55)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 12 },
  tile: { borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
