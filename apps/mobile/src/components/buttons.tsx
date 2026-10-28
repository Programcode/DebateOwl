import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { LEDGE, radius } from '@/theme/colors';
import { SPRING } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

type Look = { face: string; ledge: string; foreground: string; edge?: string; ledgeSize?: number };

/**
 * The website's tactile button (`.btn` in src/index.css): a face on a solid
 * ledge, which sinks onto the ledge while pressed. Disabled buttons go flat and
 * grey; a busy one keeps its face. The ledge sits inside the button's height,
 * so nothing moves around it. The face springs down onto its ledge as a finger
 * lands and bounces back on release (on the UI thread); `tap` adds a light
 * haptic for a screen's main actions. Under Reduce Motion it moves at once.
 */
function Tactile({
  look,
  onPress,
  disabled,
  busy,
  floating,
  testID,
  accessibilityLabel,
  tap,
  children,
}: {
  look: Look;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  floating?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  /** A light haptic as the button goes down: a screen's main actions. */
  tap?: boolean;
  children: (foreground: string) => ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const reduce = useReducedMotion();
  const flat = disabled && !busy;
  const ledge = flat ? 0 : (look.ledgeSize ?? LEDGE);
  const face = flat ? colors.disabledFace : look.face;
  const foreground = flat ? colors.disabledText : look.foreground;
  const down = useSharedValue(0);
  const press = (to: 0 | 1) => {
    down.set(reduce ? withTiming(to, { duration: 0 }) : withSpring(to, to === 1 ? SPRING.press : SPRING.pop));
  };
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * ledge }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      onPressIn={() => {
        press(1);
        if (tap) haptics.tap();
      }}
      onPressOut={() => press(0)}
      testID={testID}
      style={[styles.tactile, { backgroundColor: flat ? 'transparent' : look.ledge }, floating && scheme === 'light' && !flat && styles.floating]}>
      <Animated.View
        style={[
          styles.face,
          { backgroundColor: face, marginBottom: ledge },
          look.edge && !flat ? { borderWidth: 2, borderColor: look.edge } : null,
          faceStyle,
        ]}>
        {children(foreground)}
      </Animated.View>
    </Pressable>
  );
}

/** The one main action on a screen: the website's primary button, a size up. */
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
  const { colors } = useTheme();
  return (
    <Tactile look={{ face: colors.primaryFill, ledge: colors.primaryLedge, foreground: colors.onPrimary, ledgeSize: 5 }} onPress={onPress} busy={busy} disabled={disabled} tap>
      {(foreground) => (
        <>
          {busy ? <ActivityIndicator color={foreground} /> : null}
          <Text weight="display" style={[styles.mainLabel, { color: foreground }]}>
            {label}
          </Text>
        </>
      )}
    </Tactile>
  );
}

/** A screen's action when it is not the one main action, or a destructive one. */
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
  const look = destructive
    ? { face: colors.destructive, ledge: colors.destructiveLedge, foreground: scheme === 'dark' ? colors.background : '#FFFFFF' }
    : { face: colors.primaryFill, ledge: colors.primaryLedge, foreground: colors.onPrimary };
  return (
    <Tactile look={look} onPress={onPress} busy={busy} disabled={disabled} floating={floating} testID={testID} tap>
      {(foreground) => (
        <>
          {busy ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} color={foreground} size={20} /> : null}
          {/* A floating button sits in the pinned bar, fixed chrome: it grows with Dynamic Type to a cap. */}
          <Text weight="display" style={[styles.label, { color: foreground }]} numberOfLines={2} maxFontSizeMultiplier={floating ? 1.6 : undefined}>
            {label}
          </Text>
        </>
      )}
    </Tactile>
  );
}

/** The website's outline button: a white face with a strong edge and blue text, beside a primary one. */
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
  const look = {
    face: scheme === 'dark' ? '#1C2A44' : colors.card,
    ledge: colors.neutralLedge,
    edge: colors.borderStrong,
    foreground: colors.primary,
    ledgeSize: 3,
  };
  return (
    <Tactile look={look} onPress={onPress} disabled={disabled} floating={floating} testID={testID}>
      {(foreground) => (
        <>
          {icon ? <Icon name={icon} color={foreground} size={20} /> : null}
          <Text weight="display" style={[styles.label, { color: foreground }]} numberOfLines={2} maxFontSizeMultiplier={floating ? 1.6 : undefined}>
            {label}
          </Text>
        </>
      )}
    </Tactile>
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
  tactile: { borderRadius: radius.card, minHeight: 52 },
  face: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  floating: { boxShadow: '0 8px 20px -10px rgba(11,42,110,0.45)' },
  mainLabel: { fontSize: 18, lineHeight: 22, letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
  // A long label wraps to a second centred line; a primary action is never cut off.
  label: { fontSize: 17, lineHeight: 21, letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
  dimmed: { opacity: 0.6 },
  text: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontSize: 16 },
});
