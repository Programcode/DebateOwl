import { useState, type ReactElement, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View, type FlatListProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineNotice } from './offline-notice';

import { HOME_MAX_WIDTH } from '@/lib/layout';
import { createRowArrivals } from '@/lib/row-arrivals';
import { radius } from '@/theme/colors';
import { motionSetting, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

// Reanimated's FlatList draws its own cells (for itemLayoutAnimation).
type ListScreenProps<T> = Omit<FlatListProps<T>, 'ListHeaderComponent' | 'contentContainerStyle' | 'CellRendererComponent' | 'onRefresh' | 'refreshing'> & {
  /** What `Screen` would show above the list: titles, pickers, search. */
  header?: ReactNode;
  gap?: number;
  safeTop?: boolean;
  wide?: boolean;
  /** The column's style when the list sits in an iPad pane instead of a tab. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Rows slide into the gap a removed row leaves (Reanimated, on the UI thread; still under Reduce Motion). */
  animateLayout?: boolean;
  /** Pull to refresh: the spinner shows until the reload settles. */
  onRefresh?: () => Promise<unknown>;
};

/**
 * `Screen` for a list that can grow without bound (History, the Library, saved
 * chats): the same column, insets, keyboard handling and offline notice, but
 * the rows are a FlatList, so only those near the screen are drawn. Rows that
 * should look like one card use `CardRowFrame`.
 */
export function ListScreen<T>({ header, gap = 16, safeTop, wide, contentStyle, animateLayout = false, onRefresh, ...list }: ListScreenProps<T>): ReactElement {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? () => {
      setRefreshing(true);
      void onRefresh().finally(() => setRefreshing(false));
    }
    : undefined;
  return (
    <Animated.FlatList
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      itemLayoutAnimation={animateLayout ? LinearTransition.duration(200).reduceMotion(motionSetting(reduce)) : undefined}
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} /> : undefined}
      {...list}
      ListHeaderComponent={
        <View style={[styles.header, { gap, paddingBottom: gap }]}>
          <OfflineNotice />
          {header}
        </View>
      }
      contentContainerStyle={contentStyle ?? [styles.content, wide && styles.wide, safeTop && { paddingTop: insets.top + 12 }]}
    />
  );
}

/**
 * One row of a list drawn as a single card (the 2pt edge and rounded corners
 * `Card` gives a list), so each row can be its own FlatList cell.
 */
export function CardRowFrame({ index, count, children }: { index: number; count: number; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: colors.card, borderColor: colors.border },
        index === 0 && styles.frameFirst,
        index === count - 1 && styles.frameLast,
      ]}>
      {children}
    </View>
  );
}

/**
 * Which rows of a virtualized list arrive with ListItemIn's animation: pass the
 * list's keys on every render and ask `entersNow(key)` when a row mounts.
 */
export function useRowArrivals(keys: readonly string[]) {
  const [arrivals] = useState(() => createRowArrivals());
  arrivals.update(keys);
  return arrivals;
}

const styles = StyleSheet.create({
  // The same column as Screen: phone width on iPad unless `wide`.
  content: { paddingHorizontal: 20, paddingBottom: 32, width: '100%', maxWidth: 640, alignSelf: 'center' },
  wide: { paddingHorizontal: 36, paddingBottom: 48, maxWidth: HOME_MAX_WIDTH },
  header: { gap: 16, paddingBottom: 16 },
  frame: { borderLeftWidth: 2, borderRightWidth: 2, overflow: 'hidden' },
  frameFirst: { borderTopWidth: 2, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  frameLast: { borderBottomWidth: 2, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
});
