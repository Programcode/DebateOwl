import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The mocks' pill chip: filters in Library, options and sources in Ask. */
export function Chip({
  label,
  selected,
  icon,
  leading,
  onPress,
  accessibilityRole = 'button',
  testID,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  leading?: ReactNode;
  onPress: () => void;
  accessibilityRole?: 'button' | 'switch' | 'tab';
  testID?: string;
}) {
  const { colors } = useTheme();
  const foreground = selected ? colors.chipSelectedForeground : colors.secondary;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'switch' ? { checked: Boolean(selected) } : { selected: Boolean(selected) }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: colors.tile, borderColor: colors.chipSelectedBorder }
          : { backgroundColor: colors.input, borderColor: colors.border },
        pressed && styles.pressed,
      ]}>
      {leading}
      {icon ? <Icon name={icon} color={foreground} size={16} /> : null}
      <Text weight="medium" style={[styles.label, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The small numbered square used for citations, inline and in source chips. */
export function CiteBadge({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.cite, { backgroundColor: colors.tile }]}>
      <Text weight="bold" style={[styles.citeText, { color: colors.chipSelectedForeground }]}>
        {n}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    minHeight: 36,
    maxWidth: 280,
  },
  label: { fontSize: 14.5, flexShrink: 1 },
  pressed: { opacity: 0.7 },
  cite: { minWidth: 20, height: 20, borderRadius: 6, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  citeText: { fontSize: 12, lineHeight: 15 },
});
