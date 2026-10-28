import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, type ImageSourcePropType, type ImageStyle, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

/**
 * Ollie, the website's owl (src/components/brand/Owl.tsx), from PNGs that
 * scripts/render-owls.ts renders from the website's SVGs. Each place uses the
 * pose the website uses there: point (an empty start), coach (the Ask coach),
 * arguing (the Sparring opponent), reading (the Library), sleepy (nothing
 * saved yet), surprised (no match, an error), celebrating (done), timekeeper.
 */
export type OwlPose =
  | 'point'
  | 'idea'
  | 'skeptical'
  | 'surprised'
  | 'celebrating'
  | 'thinking'
  | 'reading'
  | 'timekeeper'
  | 'arguing'
  | 'coach'
  | 'sleepy';

const POSES: Record<OwlPose, ImageSourcePropType> = {
  point: require('@/assets/owl/point.png'),
  idea: require('@/assets/owl/idea.png'),
  skeptical: require('@/assets/owl/skeptical.png'),
  surprised: require('@/assets/owl/surprised.png'),
  celebrating: require('@/assets/owl/celebrating.png'),
  thinking: require('@/assets/owl/thinking.png'),
  reading: require('@/assets/owl/reading.png'),
  timekeeper: require('@/assets/owl/timekeeper.png'),
  arguing: require('@/assets/owl/arguing.png'),
  coach: require('@/assets/owl/coach.png'),
  sleepy: require('@/assets/owl/sleepy.png'),
};

const MARK: ImageSourcePropType = require('@/assets/owl/mark.png');

type OwlProps = {
  pose: OwlPose;
  size: number;
  /** Faces the other way, as the website mirrors the owl to point across at an action. */
  mirrored?: boolean;
  /** Read out by VoiceOver; without it the owl is decoration. */
  label?: string;
  style?: ImageStyle;
};

export function Owl({ pose, size, mirrored, label, style }: OwlProps) {
  return (
    <Image
      source={POSES[pose]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[{ width: size, height: size }, mirrored && styles.mirrored, style]}
      resizeMode="contain"
    />
  );
}

/** The owl's head in a tinted circle: the Ask coach and the Sparring opponent beside their messages. */
export function OwlAvatar({ pose, size, label }: { pose: OwlPose; size: number; label?: string }) {
  const { scheme } = useTheme();
  // The website zooms the full pose 1.6x about 52% across and 32% down, onto the head and shoulders.
  const zoomed = size * 1.6;
  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        scheme === 'dark' ? styles.avatarDark : styles.avatarLight,
      ]}>
      <Image
        source={POSES[pose]}
        resizeMode="contain"
        style={{ position: 'absolute', width: zoomed, height: zoomed, left: -0.52 * (zoomed - size), top: -0.32 * (zoomed - size) }}
      />
    </View>
  );
}

/** The owl mark on its tile, as the website's sign-in and header show it. */
export function OwlMark({ size }: { size: number }) {
  const { scheme } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { width: size, height: size + 2, borderRadius: size * 0.28, backgroundColor: scheme === 'dark' ? '#061442' : '#B3D8FC' }]}>
      <Image source={MARK} style={{ width: size, height: size, borderRadius: size * 0.28 }} />
    </View>
  );
}

/** The owl bobbing gently while a request runs, in place of a spinner where the website shows OwlLoader. */
export function OwlLoader({ pose, size, label }: { pose: OwlPose; size: number; label?: string }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.05] }) }] }}>
      <Owl pose={pose} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mirrored: { transform: [{ scaleX: -1 }] },
  avatar: { overflow: 'hidden', borderWidth: 2 },
  avatarLight: { backgroundColor: '#D6EAFE', borderColor: '#FFFFFF' },
  avatarDark: { backgroundColor: '#0B2A6E', borderColor: '#131E33' },
  mark: { overflow: 'hidden' },
});
