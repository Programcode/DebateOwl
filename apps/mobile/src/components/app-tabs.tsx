import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

import { TABS } from './tabs';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.tabInactive, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.tabInactive, fontFamily: fontFamily.medium, fontSize: 10 },
        selected: { color: colors.primary, fontFamily: fontFamily.medium, fontSize: 10 },
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
