import { useEffect, useState, type Ref } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SPRING, useReduceMotion } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A UI-thread spring press, on the hit target itself so flex, refs and accessibility stay intact. */
export function PressScale({ style, scaleTo = 0.97, onPressIn, onPressOut, disabled, ref, ...props }: PressableProps & { scaleTo?: number; ref?: Ref<View> }) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (reduce || disabled) {
      cancelAnimation(scale);
      scale.set(1);
    }
  }, [reduce, disabled, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: reduce ? 1 : scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      ref={ref}
      disabled={disabled}
      style={[typeof style === 'function' ? style({ pressed }) : style, animated]}
      onPressIn={(event) => {
        if (typeof style === 'function') setPressed(true);
        if (!reduce) scale.set(withSpring(scaleTo, SPRING.press));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (typeof style === 'function') setPressed(false);
        scale.set(reduce ? 1 : withSpring(1, SPRING.pop));
        onPressOut?.(event);
      }}
    />
  );
}
