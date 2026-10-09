import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
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

/** A solid button for a screen's action when the gradient is taken or would be too loud, as in the mocks' sheets. */
export function PrimaryButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  destructive,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  const foreground = destructive ? '#ffffff' : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: destructive ? colors.destructive : colors.primary },
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} color={foreground} size={20} /> : null}
      <Text weight="semibold" style={[styles.primaryLabel, { color: foreground }]}>
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
  primary: {
    minHeight: 52,
    borderRadius: radius.card - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  primaryLabel: { fontSize: 17 },
  dimmed: { opacity: 0.6 },
  text: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontSize: 16 },
});
