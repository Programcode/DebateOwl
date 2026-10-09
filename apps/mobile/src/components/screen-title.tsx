import { Stack } from 'expo-router';

/** On iOS the title is the native large title in the tab's stack header. */
export function ScreenTitle({ title }: { title: string }) {
  return <Stack.Screen options={{ title }} />;
}
