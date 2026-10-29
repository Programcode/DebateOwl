import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useReduceMotion } from '@/theme/motion';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

// The website's --do-skeleton, light and dark.
const SKELETON = { light: '#E2E9F2', dark: '#1C2A44' } as const;
const SHINE = { light: 'rgba(255,255,255,0.55)', dark: 'rgba(255,255,255,0.06)' } as const;

/**
 * One grey shape that shimmers left to right, as the website's .skeleton-shimmer (1.2 s,
 * starting after 300 ms so a fast load never flashes). Still under Reduce Motion.
 */
export function Skeleton({ width = '100%', height = 14, round = 6, style }: { width?: DimensionValue; height?: number; round?: number; style?: ViewStyle }) {
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  const [span, setSpan] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduce || span === 0) {
      cancelAnimation(sweep);
      return;
    }
    sweep.set(withDelay(300, withRepeat(withTiming(1, { duration: 1200 }), -1)));
    return () => cancelAnimation(sweep);
  }, [reduce, span, sweep]);
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: (sweep.value * 2 - 1) * span }] }));
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setSpan(event.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: round, backgroundColor: SKELETON[scheme] }, styles.shape, style]}>
      {reduce ? null : <Animated.View style={[StyleSheet.absoluteFill, styles.band, { backgroundColor: SHINE[scheme] }, shine]} />}
    </View>
  );
}

/**
 * A list loading in the shape of its rows: an icon tile, a title and a meta line per row.
 * It is the loading indicator (progressbar, "Loading") for VoiceOver and the screenshot script.
 */
export function SkeletonRows({ rows = 3, card = true, testID }: { rows?: number; card?: boolean; testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      testID={testID}
      style={[card && [styles.card, { backgroundColor: colors.card, borderColor: colors.border }]]}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
          <Skeleton width={40} height={40} round={radius.tile} />
          <View style={styles.text}>
            <Skeleton width={`${78 - (index % 3) * 14}%`} height={15} />
            <Skeleton width="42%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shape: { overflow: 'hidden' },
  band: { width: '60%', opacity: 1 },
  card: { borderWidth: 2, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  text: { flex: 1, gap: 8 },
});
