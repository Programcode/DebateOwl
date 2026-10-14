import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineNotice } from './offline-notice';

/**
 * A tab's scrolling content. On iOS the native header and tab bar adjust the
 * insets automatically; `safeTop` is for screens without a header. The
 * offline notice leads every tab while saved copies are shown.
 */
export function Screen({ children, safeTop, gap }: { children: ReactNode; safeTop?: boolean; gap?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, safeTop && { paddingTop: insets.top + 12 }, gap !== undefined && { gap }]}>
      <OfflineNotice />
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Content stays phone-width on iPad until the iPad layouts land.
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
});
