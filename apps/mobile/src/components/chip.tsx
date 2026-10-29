import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The mocks' pill chip: filters in Library, options and sources in Ask. */
export function Chip({
  label,
  selected,
  icon,
  leading,
  trailing,
  onPress,
  accessibilityRole = 'button',
  accessibilityLabel,
  testID,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  leading?: ReactNode;
  /** After the label, such as a remove mark. */
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityRole?: 'button' | 'switch' | 'tab' | 'radio';
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const foreground = selected ? colors.chipSelectedForeground : colors.secondary;
  return (
    <BouncePressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityRole === 'switch' || accessibilityRole === 'radio' ? { checked: Boolean(selected) } : { selected: Boolean(selected) }}
      onPress={() => {
        // A switch chip taps; a filter, tab or radio chip ticks like a picker.
        if (accessibilityRole === 'switch') haptics.tap();
        else if (!selected) haptics.select();
        onPress();
      }}
      testID={testID}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.tile, borderColor: colors.chipSelectedBorder }
          : { backgroundColor: colors.input, borderColor: colors.border },
      ]}>
      {leading}
      {icon ? <Icon name={icon} color={foreground} size={16} /> : null}
      <Text weight="medium" style={[styles.label, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </BouncePressable>
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
  cite: { minWidth: 20, height: 20, borderRadius: 6, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  citeText: { fontSize: 12, lineHeight: 15 },
});
