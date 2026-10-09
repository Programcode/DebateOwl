import { Stack } from 'expo-router';

import { useTheme } from '@/theme/use-theme';

/** The web preview draws its titles in the content (see screen-title.web.tsx). */
export function TabStack(_props: { largeTitle?: boolean }) {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
