import type { ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, View, type FlatListProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReservedWidth } from '@/lib/layout';
import { useTheme } from '@/theme/use-theme';

/**
 * The scrolling body of a form sheet. It must be the sheet's root view: react-native-screens
 * sizes a form sheet's scroll view natively, and only a direct child keeps its position. Wrapped
 * in a KeyboardAvoidingView or any other view, it falls back to `setFrame(screen.frame)`, which
 * copies the sheet's slide-in offset and leaves the content below the visible sheet.
 * The sheet rises to its top detent when the keyboard opens; the insets scroll fields clear of it.
 */
export function SheetScrollView({
  children,
  contentContainerStyle,
  testID,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, contentContainerStyle, { paddingBottom: insets.bottom + 24 }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      testID={testID}>
      {/* A sheet covers the iPad sidebar, so what it holds lays out for the whole window. */}
      <ReservedWidth.Provider value={0}>{children}</ReservedWidth.Provider>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 18, width: '100%', maxWidth: 640, alignSelf: 'center' },
});

/** A sheet's direct native scroll view, with virtualized rows instead of nested lists. */
export function SheetList<T>({ header, contentStyle, gap = 18, ListFooterComponent, ...list }: Omit<FlatListProps<T>, 'ListHeaderComponent' | 'contentContainerStyle'> & {
  header?: ReactNode;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const hasRows = (list.data?.length ?? 0) > 0;
  return (
    <ReservedWidth.Provider value={0}>
      <FlatList
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...list}
        style={[{ backgroundColor: colors.background }, list.style]}
        contentContainerStyle={[styles.content, { gap: 0 }, contentStyle, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={header ? <View style={[listStyles.header, { gap, paddingBottom: hasRows || ListFooterComponent ? gap : 0 }]}>{header}</View> : null}
        ListFooterComponent={ListFooterComponent}
        ListFooterComponentStyle={[listStyles.footer, { gap, paddingTop: hasRows ? gap : 0 }, list.ListFooterComponentStyle]}
      />
    </ReservedWidth.Provider>
  );
}

const listStyles = StyleSheet.create({
  header: { gap: 18, paddingBottom: 18 },
  footer: { gap: 18, paddingTop: 18 },
});
