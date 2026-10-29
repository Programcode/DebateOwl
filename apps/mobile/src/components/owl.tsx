import { useEffect, useState } from 'react';
import { Image, type ImageSourcePropType, type ImageStyle, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DURATION, EASE, SPRING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

/**
 * Ollie, the website's owl (src/components/brand/Owl.tsx), from PNGs that
 * scripts/render-owls.ts renders from the website's SVGs. Each place uses the
 * pose the website uses there: point (an empty start), coach (the Ask coach),
 * arguing (the Sparring opponent), reading (the Library), sleepy (nothing
 * saved yet), surprised (no match, an error), celebrating (done), timekeeper.
 *
 * It moves as the website's owl does (src/index.css, "The owl's motion"), on the
 * UI thread with Reanimated: it blinks on its own clock, breathes, plays its
 * pose's gesture (wave, cheer, hop) when it arrives or changes pose, and pops
 * into a new pose. Under Reduce Motion it stays still.
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

/** A one-shot move the owl plays when it arrives or changes pose. */
export type OwlGesture = 'wave' | 'cheer' | 'hop';

const GESTURES: Partial<Record<OwlPose, OwlGesture>> = {
  point: 'wave',
  coach: 'wave',
  arguing: 'wave',
  celebrating: 'cheer',
  surprised: 'hop',
  idea: 'hop',
};

/** Each eye as [left, top, width, height] in % of the square (the website's EYES); sleepy's are shut. */
type EyeBox = readonly [number, number, number, number];
const EYES: Partial<Record<OwlPose | 'mark', readonly [EyeBox, EyeBox]>> = {
  arguing: [[34.4, 22.2, 12.8, 14], [56.6, 22.2, 11.8, 14]],
  celebrating: [[31.3, 20, 11.7, 12.8], [50.9, 19.4, 10.9, 12.8]],
  coach: [[37.7, 23.9, 13, 14.4], [60.4, 23.9, 12.1, 14.4]],
  idea: [[41.7, 23.5, 13.4, 14.7], [64.3, 24, 12.5, 14.7]],
  point: [[35.5, 22.7, 13.5, 14.8], [59, 22.7, 12.5, 14.8]],
  reading: [[33, 25.9, 12.8, 14], [55.2, 25.9, 11.8, 14]],
  skeptical: [[29.3, 27.8, 12.2, 11.8], [50.6, 27.4, 11.5, 11.8]],
  surprised: [[38.3, 17, 13, 14.3], [60.4, 17.5, 12.1, 14.3]],
  thinking: [[31.2, 25.9, 12.8, 14], [53.3, 25.9, 11.8, 14]],
  timekeeper: [[30.1, 22.2, 12.8, 14], [52.3, 22.2, 11.8, 14]],
  mark: [[27.3, 36.3, 18, 19.5], [54.7, 36.3, 18, 19.5]],
};

// Below this the lids are a pixel or two and a blink reads as flicker.
const MIN_BLINK_SIZE = 28;

/** Whether iOS's Reduce Motion is on, kept current; every moving part of the app checks it. */
export { useReduceMotion };

/**
 * A blink on this owl's own clock (a period of 4.6 to 7 s and a random phase, fixed for its
 * lifetime): flat lids pull down over the eyes for about a tenth of a second, the website's
 * owl-blink keyframes (closed at 95%, nearly open at 97%).
 */
function useBlink(enabled: boolean): SharedValue<number> {
  const lid = useSharedValue(0);
  const [clock] = useState(() => ({ period: 4600 + Math.random() * 2400, phase: Math.random() * 6000 }));
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(lid);
      lid.set(0);
      return;
    }
    const { period, phase } = clock;
    lid.set(withDelay(
      phase,
      withRepeat(
        withSequence(
          withDelay(period * 0.93, withTiming(1, { duration: period * 0.02 })),
          withTiming(0.15, { duration: period * 0.02 }),
          withTiming(0, { duration: period * 0.03 }),
        ),
        -1,
      ),
    ));
    return () => cancelAnimation(lid);
  }, [enabled, clock, lid]);
  return lid;
}

/** Two lids over the eyes, in the owl's blue with a navy lash; flat (scaleY 0) between blinks. */
function OwlLids({ eyes, size, lid, offset = { left: 0, top: 0 } }: { eyes: readonly [EyeBox, EyeBox]; size: number; lid: SharedValue<number>; offset?: { left: number; top: number } }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: lid.value }] }));
  const lash = Math.max(1, size * 0.012) * 1.6;
  return (
    <>
      {eyes.map(([left, top, width, height], index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={[
            styles.lid,
            {
              left: offset.left + (left / 100) * size,
              top: offset.top + (top / 100) * size,
              width: (width / 100) * size,
              height: (height / 100) * size,
              borderBottomWidth: lash,
            },
            style,
          ]}
        />
      ))}
    </>
  );
}

/** The gesture's transform at progress 0..1: the website's owl-wave, owl-cheer and owl-hop keyframes. */
function gestureTransform(move: OwlGesture | undefined, t: number, size: number) {
  'worklet';
  if (move === 'wave') {
    return [{ rotate: `${interpolate(t, [0, 0.18, 0.38, 0.58, 0.78, 1], [0, -7, 6, -4, 2, 0])}deg` }];
  }
  if (move === 'cheer') {
    // Two jumps with squash and stretch.
    const at = [0, 0.1, 0.28, 0.44, 0.58, 0.74, 0.88, 1];
    return [
      { translateY: (interpolate(t, at, [0, 0, -14, 0, -7, 0, 0, 0]) / 100) * size },
      { rotate: `${interpolate(t, at, [0, 0, 0, 0, -3, 0, 0, 0])}deg` },
      { scaleX: interpolate(t, at, [1, 1.07, 0.95, 1.06, 0.98, 1.03, 0.995, 1]) },
      { scaleY: interpolate(t, at, [1, 0.9, 1.07, 0.93, 1.03, 0.97, 1.005, 1]) },
    ];
  }
  if (move === 'hop') {
    const at = [0, 0.18, 0.45, 0.72, 1];
    return [
      { translateY: (interpolate(t, at, [0, 0, -8, 0, 0]) / 100) * size },
      { scaleX: interpolate(t, at, [1, 1.05, 0.97, 1.03, 1]) },
      { scaleY: interpolate(t, at, [1, 0.93, 1.04, 0.97, 1]) },
    ];
  }
  return [];
}

const GESTURE_TIMING: Record<OwlGesture, { duration: number; delay: number; origin: string }> = {
  wave: { duration: 900, delay: 120, origin: '50% 90%' },
  cheer: { duration: 1100, delay: 80, origin: '50% 100%' },
  hop: { duration: 600, delay: 80, origin: '50% 100%' },
};

type OwlProps = {
  pose: OwlPose;
  size: number;
  /** Faces the other way, as the website mirrors the owl to point across at an action. */
  mirrored?: boolean;
  /** Read out by VoiceOver; without it the owl is decoration. */
  label?: string;
  style?: ImageStyle;
  /** The move played on arrival and on each pose change; false keeps it still. Defaults by pose. */
  gesture?: OwlGesture | false;
  /** A slow breath while idle; off where something else moves the owl (a loader's bob). */
  breathe?: boolean;
  /** Plays the gesture again when this changes, such as a result arriving. */
  replay?: unknown;
};

/**
 * Ollie, full body: blinks, breathes, plays its pose's gesture when it arrives, a pose change
 * pops in on the website's `pop` spring, and `replay` cheers again on demand.
 */
export function Owl({ pose, size, mirrored, label, style, gesture, breathe = true, replay }: OwlProps) {
  const reduce = useReduceMotion();
  const move = gesture === undefined ? GESTURES[pose] : gesture || undefined;
  const eyes = size >= MIN_BLINK_SIZE ? EYES[pose] : undefined;
  const lid = useBlink(!reduce && Boolean(eyes));

  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduce || !breathe) {
      cancelAnimation(breath);
      breath.set(0);
      return;
    }
    breath.set(withRepeat(withTiming(1, { duration: 1900, easing: EASE.standard }), -1, true));
    return () => cancelAnimation(breath);
  }, [reduce, breathe, breath]);

  // Arrival and each pose change: a pop from slightly small and low, then the pose's gesture.
  const arrive = useSharedValue(reduce ? 1 : 0);
  const play = useSharedValue(1);
  useEffect(() => {
    if (reduce) {
      arrive.set(1);
      play.set(1);
      return;
    }
    arrive.set(withSequence(withTiming(0, { duration: 0 }), withSpring(1, SPRING.pop)));
    if (move) {
      const { duration, delay } = GESTURE_TIMING[move];
      play.set(withSequence(withTiming(0, { duration: 0 }), withDelay(delay, withTiming(1, { duration, easing: EASE.standard }))));
    }
  }, [pose, move, replay, reduce, arrive, play]);

  const bodyStyle = useAnimatedStyle(() => ({
    transformOrigin: '50% 92%',
    transform: [{ scaleX: 1 + 0.012 * breath.value }, { scaleY: 1 + 0.028 * breath.value }],
  }));
  const poseStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, arrive.value * 2),
    transform: [{ translateY: (1 - arrive.value) * 6 }, { scale: 0.9 + 0.1 * arrive.value }],
  }));
  const gestureStyle = useAnimatedStyle(() => ({
    transformOrigin: move ? GESTURE_TIMING[move].origin : '50% 50%',
    transform: gestureTransform(move, play.value, size),
  }));

  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[{ width: size, height: size }, mirrored && styles.mirrored, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, poseStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, gestureStyle]}>
            <Image source={POSES[pose]} style={{ width: size, height: size }} resizeMode="contain" />
            {eyes ? <OwlLids eyes={eyes} size={size} lid={lid} /> : null}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * The owl's head in a tinted circle: the Ask coach and the Sparring opponent beside their
 * messages. `blink` only where the avatar is present (a header, a working indicator), as on the
 * website: a transcript of blinking owls reads as noise.
 */
export function OwlAvatar({ pose, size, label, blink = false }: { pose: OwlPose; size: number; label?: string; blink?: boolean }) {
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  // The website zooms the full pose 1.6x about 52% across and 32% down, onto the head and shoulders.
  const zoomed = size * 1.6;
  const offset = { left: -0.52 * (zoomed - size), top: -0.32 * (zoomed - size) };
  const eyes = blink && zoomed >= MIN_BLINK_SIZE ? EYES[pose] : undefined;
  const lid = useBlink(!reduce && Boolean(eyes));
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
      <Image source={POSES[pose]} resizeMode="contain" style={{ position: 'absolute', width: zoomed, height: zoomed, ...offset }} />
      {eyes ? <OwlLids eyes={eyes} size={zoomed} lid={lid} offset={offset} /> : null}
    </View>
  );
}

/** The owl mark on its tile, as the website's sign-in and header show it; it blinks from 28 points. */
export function OwlMark({ size }: { size: number }) {
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  const eyes = size >= MIN_BLINK_SIZE ? EYES.mark : undefined;
  const lid = useBlink(!reduce && Boolean(eyes));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { width: size, height: size + 2, borderRadius: size * 0.28, backgroundColor: scheme === 'dark' ? '#061442' : '#B3D8FC' }]}>
      <Image source={MARK} style={{ width: size, height: size, borderRadius: size * 0.28 }} />
      {eyes ? <OwlLids eyes={eyes} size={size} lid={lid} /> : null}
    </View>
  );
}

/**
 * The owl floating gently while a request runs, where the website shows OwlLoader (owl-bob:
 * 5 points up and down over 2.4 s), blinking as it waits; still under Reduce Motion.
 */
export function OwlLoader({ pose, size, label }: { pose: OwlPose; size: number; label?: string }) {
  const reduce = useReduceMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(bob);
      bob.set(0);
      return;
    }
    bob.set(withRepeat(withTiming(1, { duration: DURATION.ambient / 2, easing: EASE.standard }), -1, true));
    return () => cancelAnimation(bob);
  }, [reduce, bob]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * bob.value }] }));
  return (
    // Labelled, it is the progress indicator; unlabelled, a progress line beside it speaks and the owl is decoration.
    <Animated.View
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={style}>
      <Owl pose={pose} size={size} breathe={false} gesture={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mirrored: { transform: [{ scaleX: -1 }] },
  avatar: { overflow: 'hidden', borderWidth: 2 },
  avatarLight: { backgroundColor: '#D6EAFE', borderColor: '#FFFFFF' },
  avatarDark: { backgroundColor: '#0B2A6E', borderColor: '#131E33' },
  mark: { overflow: 'hidden' },
  // The website's .owl-lid: the owl's blue, a navy lash, closing from the top.
  lid: { position: 'absolute', borderRadius: 999, backgroundColor: '#1E8DFB', borderBottomColor: '#0B2A6E', transformOrigin: '50% 0%' },
});
