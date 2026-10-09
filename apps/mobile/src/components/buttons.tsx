import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from './text';

import { mainActionGradient, radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The one main action on a screen, in the website's Start Trial gradient. */
export function MainActionButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.main, (pressed || inactive) && styles.dimmed]}>
      <LinearGradient {...mainActionGradient} style={StyleSheet.absoluteFill} />
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text weight="semibold" style={styles.mainLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A secondary action shown as tinted text, like an iOS plain button. */
export function TextButton({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.text, (pressed || disabled) && styles.dimmed]}>
      <Text weight="semibold" style={[styles.textLabel, { color: destructive ? colors.destructive : colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  main: {
    minHeight: 52,
    borderRadius: radius.card - 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  mainLabel: { color: '#ffffff', fontSize: 17 },
  dimmed: { opacity: 0.6 },
  text: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontSize: 16 },
});
