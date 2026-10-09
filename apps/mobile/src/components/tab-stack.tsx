import { Stack } from 'expo-router';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

/** Each tab is a native stack with an iOS large title, so later screens can push onto it. */
export function TabStack({ largeTitle = true }: { largeTitle?: boolean }) {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: largeTitle,
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerBlurEffect: 'systemMaterial',
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerLargeTitleStyle: { fontFamily: fontFamily.bold, color: colors.foreground },
        headerTitleStyle: { fontFamily: fontFamily.semibold, color: colors.foreground },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
