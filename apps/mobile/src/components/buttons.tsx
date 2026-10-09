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
  floating,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  /** Pinned above the content, as the mocks' bottom actions are. */
  floating?: boolean;
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  const inactive = disabled || busy;
  const foreground = destructive ? '#ffffff' : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: destructive ? colors.destructive : colors.primary },
        floating && scheme === 'light' && styles.primaryShadow,
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} color={foreground} size={20} /> : null}
      <Text weight="semibold" style={[styles.primaryLabel, { color: foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The outlined button beside a primary one, as "Attack this case" in mock 03. */
export function SecondaryButton({
  label,
  icon,
  onPress,
  disabled,
  floating,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  floating?: boolean;
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primary,
        styles.secondary,
        { backgroundColor: colors.input, borderColor: colors.border },
        floating && scheme === 'light' && styles.secondaryShadow,
        (pressed || disabled) && styles.dimmed,
      ]}>
      {icon ? <Icon name={icon} color={colors.foreground} size={20} /> : null}
      <Text weight="semibold" style={styles.primaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
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
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** For VoiceOver when the visible label repeats on a list of items. */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
  primaryLabel: { fontSize: 17, flexShrink: 1 },
  primaryShadow: { boxShadow: '0 6px 18px -8px rgba(2,132,199,0.6)' },
  // The mock's outlined button has almost no side padding, so its label fits half the width.
  secondary: { borderWidth: 1, paddingHorizontal: 6, gap: 6 },
  secondaryShadow: { boxShadow: '0 6px 18px -8px rgba(15,23,42,0.35)' },
  dimmed: { opacity: 0.6 },
  text: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontSize: 16 },
});
