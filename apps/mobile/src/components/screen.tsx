import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A tab's scrolling content. On iOS the native header and tab bar adjust the
 * insets automatically; `safeTop` is for screens without a header.
 */
export function Screen({ children, safeTop }: { children: ReactNode; safeTop?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, safeTop && { paddingTop: insets.top + 12 }]}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Content stays phone-width on iPad until the iPad layouts land.
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
});
