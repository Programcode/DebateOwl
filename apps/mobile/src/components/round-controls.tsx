import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { mainActionGradient } from '@/theme/colors';
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
        <Text accessibilityRole="header" weight="bold" style={styles.title} numberOfLines={1}>
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

/** The one main action of a live screen, in the gradient, with its label under it. */
export function MainRoundControl({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID} style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
      <View style={styles.mainHalo}>
        <View style={styles.mainCircle}>
          {/* The gradient carries the rounding, so the circle's shadow is not clipped. */}
          <LinearGradient {...mainActionGradient} style={[StyleSheet.absoluteFill, styles.mainGradient]} />
          {/* Above the gradient: the web preview paints positioned views over static ones. */}
          <View style={styles.mainIcon}>
            <Icon name={icon} color="#ffffff" size={32} />
          </View>
        </View>
      </View>
      <Text tone="faint" style={styles.controlLabel} numberOfLines={1}>
        {label}
      </Text>
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
  sideCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  sideBorder: { borderWidth: 1 },
  mainHalo: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.14)' },
  mainGradient: { borderRadius: 42 },
  mainIcon: { position: 'relative' },
  mainCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 30px -6px rgba(20,184,166,0.6)',
  },
});
