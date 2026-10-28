import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { EASE } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
// The check's path is about 23 units long, as the website's lucide Check.
const CHECK_LENGTH = 24;

/**
 * Success, always mint with a check mark: the badge pops on the overshoot curve and the tick
 * draws itself in (the website's .success-pop and check-draw), with a success tap. `delay`
 * staggers it after something else arrives; `haptic={false}` where the caller already tapped.
 * Under Reduce Motion it is simply there.
 */
export function SuccessCheck({ size = 22, delay = 0, haptic = true }: { size?: number; delay?: number; haptic?: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pop = useSharedValue(reduce ? 1 : 0);
  const draw = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (haptic) haptics.success();
    if (reduce) {
      pop.set(1);
      draw.set(1);
      return;
    }
    // 0.4 → 1.14 → 1 over 420 ms, then the tick draws over 360 ms from 140 ms in.
    pop.set(withDelay(delay, withSequence(withTiming(1.14, { duration: 250, easing: EASE.decelerate }), withTiming(1, { duration: 170, easing: EASE.standard }))));
    draw.set(withDelay(delay + 140, withTiming(1, { duration: 360, easing: EASE.decelerate })));
    // One pop per mount: a re-render must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.6),
    transform: [{ scale: 0.4 + 0.6 * pop.value }],
  }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - draw.value) }));

  return (
    <Animated.View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.successFill }, badge]}>
      <Svg width={size * 0.64} height={size * 0.64} viewBox="0 0 24 24" fill="none">
        <AnimatedPath
          d="M20 6 9 17l-5-5"
          stroke="#FFFFFF"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LENGTH}
          animatedProps={tick}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
