import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Skeleton } from './skeleton';

import { radius } from '@/theme/colors';
import { SPRING, staggerDelay } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

/** The mocks' pale-blue icon tile. */
export function IconTile({ name, size = 40 }: { name: IconName; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: colors.tile }]}>
      <Icon name={name} color={colors.tileForeground} size={Math.round(size * 0.55)} />
    </View>
  );
}

/**
 * A list row arriving: it fades up into place, 40 ms after the row above it, the first time it
 * mounts. With `layout`, rows slide into a gap a removed row leaves. Both are Reanimated layout
 * animations on the UI thread and follow the system's Reduce Motion (ReduceMotion.System), so
 * under it the row is simply there. Keep press feedback on a view inside it, never on this one.
 */
export function ListItemIn({ index, layout = false, style, children }: { index: number; layout?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(staggerDelay(index)).duration(220)} layout={layout ? LinearTransition.duration(200) : undefined} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * PressScale's give for a row that must stay its own Pressable (a Link's trigger, a row in a
 * swipeable, a tile whose layout lives on the Pressable): spread the handlers on the Pressable and
 * put `style` on an Animated.View inside it. Under Reduce Motion it does not move.
 */
export function usePressScale(scaleTo = 0.97) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduce) scale.set(withTiming(scaleTo, { duration: 90 }));
    },
    onPressOut: () => {
      if (!reduce) scale.set(withSpring(1, SPRING.pop));
    },
  };
}

/**
 * A list of text-only rows loading (a title and a meta line each), for lists without icon tiles.
 * Like SkeletonRows it is the loading indicator (progressbar, "Loading").
 */
export function SkeletonTextRows({ rows = 3, card = true, label, testID }: { rows?: number; card?: boolean; label?: string; testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
      testID={testID}
      style={[card && [styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]]}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.skeletonRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
          <Skeleton width={`${82 - (index % 3) * 15}%`} height={15} />
          <Skeleton width="38%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 12 },
  tile: { borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  skeletonCard: { borderWidth: 2, borderRadius: radius.card, overflow: 'hidden' },
  skeletonRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 15 },
});
