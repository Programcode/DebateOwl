import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { SPRING, useReduceMotion } from '@/theme/motion';

/**
 * A pressable card or row that gives under the finger: it eases to 97% as a finger lands and
 * springs back on release, on the UI thread. Rows never lift (the website's motion-list-item);
 * they only press in. Under Reduce Motion it does not move.
 */
export function PressScale({ children, style, scaleTo = 0.97, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        if (!reduce) scale.set(withTiming(scaleTo, { duration: 90 }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduce) scale.set(withSpring(1, SPRING.pop));
        onPressOut?.(event);
      }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
