import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineNotice } from './offline-notice';

import { HOME_MAX_WIDTH } from '@/lib/layout';

/**
 * A tab's scrolling content. On iOS the native header and tab bar adjust the
 * insets automatically; `safeTop` is for screens without a header. `wide` is
 * an iPad dashboard's width instead of the phone-width column. The offline
 * notice leads every tab while saved copies are shown.
 */
export function Screen({ children, safeTop, gap, wide }: { children: ReactNode; safeTop?: boolean; gap?: number; wide?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, wide && styles.wide, safeTop && { paddingTop: insets.top + 12 }, gap !== undefined && { gap }]}>
      <OfflineNotice />
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Tabs without an iPad layout keep a phone-width column on iPad.
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  wide: { paddingHorizontal: 36, paddingBottom: 48, maxWidth: HOME_MAX_WIDTH },
});
