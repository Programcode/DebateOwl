import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { TABS } from './tabs';
import { Text } from './text';

import { SIDEBAR_WIDTH, useLayoutClass } from '@/lib/layout';
import { useTheme } from '@/theme/use-theme';

/**
 * Native tabs are UIKit, which the web preview cannot draw, so this draws the
 * mock's tab bar instead. It exists for VPS screenshots only. On iPad widths it
 * draws what iPadOS shows for NativeTabs' sidebarAdaptable: the five tabs in a
 * sidebar when wide, and in a bar at the top in between (iPad mock A).
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useLayoutClass();

  if (layout === 'wide') {
    return (
      <Tabs style={[styles.root, styles.row]}>
        <TabList
          accessibilityRole="tablist"
          style={[styles.sidebar, { backgroundColor: colors.card, borderRightColor: colors.line, paddingTop: insets.top + 18 }]}>
          <Text accessibilityRole="header" weight="display" style={styles.sidebarTitle}>
            DebateOwl
          </Text>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <SidebarButton icon={tab.icon} label={t(tab.label)} />
            </TabTrigger>
          ))}
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>
    );
  }

  if (layout === 'regular') {
    return (
      <Tabs style={styles.root}>
        {/* Tabs reads its triggers from a TabList that is its own child, so the bar is the TabList itself. */}
        <TabList
          accessibilityRole="tablist"
          style={[styles.topTabs, { marginTop: insets.top + 10, backgroundColor: colors.card, borderColor: colors.line }]}>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TopTabButton label={t(tab.label)} />
            </TabTrigger>
          ))}
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>
    );
  }

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList
        accessibilityRole="tablist"
        style={[
          styles.bar,
          { backgroundColor: colors.tabBar, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 12) },
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
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.tab}>
      <Icon name={icon} color={color} size={25} />
      <Text weight="medium" style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const SidebarButton = forwardRef<View, TabTriggerSlotProps & { icon: IconName; label: string }>(function SidebarButton(
  { icon, label, isFocused, ...props },
  ref,
) {
  const { colors } = useTheme();
  const color = isFocused ? colors.onPrimary : colors.foreground;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={[styles.sidebarRow, isFocused && { backgroundColor: colors.primaryFill }]}>
      <Icon name={icon} color={isFocused ? colors.onPrimary : colors.primary} size={22} />
      <Text weight={isFocused ? 'semibold' : 'regular'} style={[styles.sidebarLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const TopTabButton = forwardRef<View, TabTriggerSlotProps & { label: string }>(function TopTabButton({ label, isFocused, ...props }, ref) {
  const { colors } = useTheme();
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={[styles.topTab, isFocused && { backgroundColor: colors.input }]}>
      <Text weight={isFocused ? 'semibold' : 'medium'} style={[styles.topLabel, { color: isFocused ? colors.primary : colors.secondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  slot: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44 },
  label: { fontSize: 10.5 },
  sidebar: { width: SIDEBAR_WIDTH, flexDirection: 'column', justifyContent: 'flex-start', gap: 4, paddingHorizontal: 12, borderRightWidth: StyleSheet.hairlineWidth },
  sidebarTitle: { fontSize: 22, letterSpacing: -0.4, marginLeft: 8, marginBottom: 14 },
  sidebarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingHorizontal: 12, minHeight: 40 },
  sidebarLabel: { fontSize: 16.5 },
  topTabs: { alignSelf: 'center', marginBottom: 6, flexDirection: 'row', justifyContent: 'center', gap: 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, padding: 4 },
  topTab: { borderRadius: 999, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center' },
  topLabel: { fontSize: 15 },
});
