import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition, cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { Skeleton } from './skeleton';

import { radius } from '@/theme/colors';
import { motionSetting, SPRING, staggerDelay, useReduceMotion } from '@/theme/motion';
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
 * In a virtualized list, `enter` says whether the row is arriving (row-arrivals.ts) or only
 * scrolled back into view, and the list animates layout itself (`itemLayoutAnimation`).
 */
export function ListItemIn({ index, layout = false, enter = true, style, children }: { index: number; layout?: boolean; enter?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReduceMotion();
  return (
    <Animated.View
      entering={enter ? FadeInDown.delay(staggerDelay(index)).duration(220).reduceMotion(motionSetting(reduce)) : undefined}
      layout={layout ? LinearTransition.duration(200).reduceMotion(motionSetting(reduce)) : undefined}
      style={style}>
      {children}
    </Animated.View>
  );
}

// App-session keys belong to decorative entrances, never to saved content or request state.
const entered = new Set<string>();

/** A short staggered spring the first time this tab's card appears this app session. */
export function SessionEntrance({ name, index = 0, style, children }: { name: string; index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReduceMotion();
  const [enter] = useState(() => !entered.has(name));
  useEffect(() => { entered.add(name); }, [name]);
  return (
    <Animated.View
      style={style}
      entering={enter && !reduce ? FadeInDown.delay(staggerDelay(index)).springify().damping(SPRING.settle.damping).stiffness(SPRING.settle.stiffness).reduceMotion(motionSetting(reduce)) : undefined}>
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
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(scale);
      scale.set(1);
    }
  }, [reduce, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: reduce ? 1 : scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduce) scale.set(withSpring(scaleTo, SPRING.press));
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
