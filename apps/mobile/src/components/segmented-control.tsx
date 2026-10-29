import { StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/use-theme';

type Option<T extends string> = { value: T; label: string };

/** The mocks' segmented control (In favor / Against), drawn the same on iOS and in the web preview. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: colors.segmentTrack }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <BouncePressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (!selected) haptics.select();
              onChange(option.value);
            }}
            style={[
              styles.segment,
              selected && [styles.selected, { backgroundColor: colors.segmentSelected }],
              selected && scheme === 'light' && styles.selectedShadow,
            ]}>
            <Text weight="semibold" tone={selected ? 'foreground' : 'secondary'} style={styles.label} maxFontSizeMultiplier={1.6}>
              {option.label}
            </Text>
          </BouncePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 11, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 9 },
  selected: {},
  selectedShadow: { boxShadow: '0 1px 3px rgba(11,42,110,0.12)' },
  label: { fontSize: 14 },
});
