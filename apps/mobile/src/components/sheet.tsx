import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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
