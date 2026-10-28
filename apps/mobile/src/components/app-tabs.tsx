import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

import { TABS } from './tabs';

import { useSidebarWidth } from '@/lib/layout';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // A full-screen iPad window shows the app's own sidebar (app-sidebar.tsx), which lists every
  // tool, so the tab bar hides. Split View and narrower windows keep the tab bar.
  const sidebar = useSidebarWidth() > 0;
  return (
    <NativeTabs
      hidden={sidebar}
      tintColor={colors.primary}
      iconColor={{ default: colors.tabInactive, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.tabInactive, fontFamily: fontFamily.semibold, fontSize: 10 },
        selected: { color: colors.primary, fontFamily: fontFamily.semibold, fontSize: 10 },
      }}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Icon src={tab.image} renderingMode="template" />
          <NativeTabs.Trigger.Label>{t(tab.label)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
