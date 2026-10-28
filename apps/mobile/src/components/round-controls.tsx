import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

/** The round button in a live screen's top bar, as mock 05's close and flow buttons. */
export function RoundIconButton({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.round, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : colors.segmentTrack }, pressed && styles.pressed]}>
      <Icon name={icon} color={colors.foreground} size={20} />
    </Pressable>
  );
}

/** A live screen's top bar: a button either side of a centred title and line under it. */
export function LiveTopBar({ left, right, title, subtitle }: { left: ReactNode; right?: ReactNode; title: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.side}>{left}</View>
      <View style={styles.titles}>
        <Text accessibilityRole="header" weight="display" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text tone="faint" style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

/** A small round control with its label under it, beside the main one. */
export function SideControl({ icon, label, onPress, disabled, testID }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.control, (pressed || disabled) && styles.pressed]}>
      <View style={[styles.sideCircle, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : colors.card, borderColor: colors.border }, scheme === 'light' && styles.sideBorder]}>
        <Icon name={icon} color={colors.foreground} size={22} />
      </View>
      <Text tone="faint" style={styles.controlLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The one main action of a live screen, a round tactile button on its ledge, with its label under it. */
export function MainRoundControl({ icon, label, onPress, disabled, testID }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={styles.control}>
      {({ pressed }) => (
        <>
          <View style={[styles.mainHalo, disabled && styles.mainDisabled]}>
            <View
              style={[
                styles.mainCircle,
                { backgroundColor: colors.primaryFill, borderBottomColor: colors.primaryLedge },
                pressed && styles.mainPressed,
              ]}>
              <Icon name={icon} color="#ffffff" size={32} />
            </View>
          </View>
          <Text tone="faint" style={[styles.controlLabel, styles.mainLabel]} numberOfLines={2}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  side: { width: 44, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  titles: { flex: 1, alignItems: 'center', gap: 1 },
  title: { fontSize: 17 },
  subtitle: { fontSize: 14 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  control: { alignItems: 'center', gap: 6, minWidth: 88 },
  controlLabel: { fontSize: 13.5 },
  // Long labels such as "Your Con R1 is next" wrap under the button instead of being cut.
  mainLabel: { maxWidth: 150, textAlign: 'center' },
  sideCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  sideBorder: { borderWidth: 1 },
  mainHalo: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,111,240,0.12)' },
  mainDisabled: { opacity: 0.45 },
  mainCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 26px -8px rgba(11,42,110,0.45)',
  },
  // Sinks onto its ledge, as the website's buttons do.
  mainPressed: { borderBottomWidth: 0, marginTop: 5, boxShadow: 'none' },
});
