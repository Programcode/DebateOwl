import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { TABS } from './tabs';
import { Text } from './text';

import { useSidebarWidth } from '@/lib/layout';
import { useTheme } from '@/theme/use-theme';

/**
 * Native tabs are UIKit, which the web preview cannot draw, so this draws the
 * mock's tab bar instead. It exists for VPS screenshots only. From the iPad
 * widths the app's own sidebar (app-sidebar.tsx, beside the root stack) lists
 * every tool, so the tab bar is hidden there, as app-tabs.tsx hides the native one.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sidebar = useSidebarWidth() > 0;

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      {/* Tabs reads its triggers from a TabList that is its own child, so a hidden bar is still the TabList. */}
      <TabList
        accessibilityRole="tablist"
        testID="app-tab-bar"
        style={[
          styles.bar,
          { backgroundColor: colors.tabBar, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 12) },
          sidebar && styles.hidden,
        ]}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton icon={tab.icon} label={t(tab.label)} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const TabButton = forwardRef<View, TabTriggerSlotProps & { icon: IconName; label: string }>(function TabButton(
  { icon, label, isFocused, ...props },
  ref,
) {
  const { colors } = useTheme();
  const color = isFocused ? colors.primary : colors.tabInactive;
  return (
    <BouncePressable ref={ref} {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.tab}>
      <Icon name={icon} color={color} size={25} />
      {/* Tab labels are fixed chrome, so they stop growing at a modest Dynamic Type size. */}
      <Text weight="medium" style={[styles.label, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </BouncePressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  slot: { flex: 1 },
  hidden: { display: 'none' },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44 },
  label: { fontSize: 10.5 },
});
