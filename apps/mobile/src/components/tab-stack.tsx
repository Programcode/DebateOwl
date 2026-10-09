import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

// iOS 26 draws its own scroll edge effect under a transparent header; a blur on top of it
// doubles the effect (react-native-screens warns). Earlier iOS has no edge effect, so it keeps the blur.
const legacyHeaderBlur = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 26;

/** Each tab is a native stack with an iOS large title, so later screens can push onto it. */
export function TabStack({ largeTitle = true }: { largeTitle?: boolean }) {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: largeTitle,
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerBlurEffect: legacyHeaderBlur ? 'systemMaterial' : 'none',
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
