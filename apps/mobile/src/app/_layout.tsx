import '@/lib/i18n';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TimerRunner } from '@/components/timer-runner';
import { ToastHost, ToastProvider } from '@/components/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DebateProvider } from '@/lib/debate-context';
import { watchNetwork } from '@/lib/network-status';
import { refreshPush } from '@/lib/push';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { appFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <DebateProvider>
          <ToastProvider>
            <Root />
          </ToastProvider>
        </DebateProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const { session, loading, settled } = useAuth();
  const { ready: settingsReady, language } = useSettings();
  const { scheme, colors } = useTheme();
  // Settings come from the device here, so the app opens in the account's language and theme.
  const ready = (fontsLoaded || fontError !== null) && !loading && settingsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Offline, reads answer from saved copies and the screens say so.
  useEffect(() => watchNetwork(), []);

  // A phone that opted in registers again on launch and when the language changes (see refreshPush).
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId || !settingsReady) return;
    refreshPush(userId, language).catch((cause: unknown) => {
      console.warn('Could not refresh the push token:', cause instanceof Error ? cause.message : cause);
    });
  }, [userId, language, settingsReady]);

  if (!ready) return null;

  // Native form sheets with a grabber on iOS. The web preview shows them as full pages.
  const sheet: NativeStackNavigationOptions = {
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.86, 1],
    sheetCornerRadius: 22,
    contentStyle: { backgroundColor: colors.background },
  };

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.line,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* The screenshot script waits for auth-settled before it checks an offline cold start. Swipeable rows need the gesture root. */}
      <GestureHandlerRootView style={styles.root} testID={settled ? 'auth-settled' : 'auth-pending'}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={session !== null}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="debates" options={sheet} />
            <Stack.Screen name="new-debate" options={sheet} />
            <Stack.Screen name="edit-debate" options={sheet} />
            <Stack.Screen name="debate-check" options={sheet} />
            <Stack.Screen name="delete-account" options={sheet} />
            <Stack.Screen name="delete-data" options={sheet} />
            <Stack.Screen name="add-link" options={sheet} />
            <Stack.Screen name="new-note" options={sheet} />
            <Stack.Screen name="add-file" options={sheet} />
            <Stack.Screen name="source/[id]" options={sheet} />
            {/* The website's limit and model dialogs; short, so the sheet stops at half height. */}
            <Stack.Screen name="limit" options={{ ...sheet, sheetAllowedDetents: [0.56, 0.86] }} />
            <Stack.Screen name="save-case" options={{ ...sheet, sheetAllowedDetents: [0.56, 0.86] }} />
            <Stack.Screen name="context-review" options={sheet} />
            {/* Full screen above the tabs, as in mock 07. */}
            <Stack.Screen name="ask" />
            {/* History, full screen above the tabs like the documents it opens. */}
            <Stack.Screen name="history" />
            {/* Generate, Attack, Brainstorm, Factoids and their documents, full screen above the tabs, as in mock 03. */}
            <Stack.Screen name="generate" />
            <Stack.Screen name="case/[id]" />
            <Stack.Screen name="attack/index" />
            <Stack.Screen name="attack/[id]" />
            <Stack.Screen name="brainstorm/index" />
            <Stack.Screen name="brainstorm/[id]" />
            <Stack.Screen name="factoids/index" />
            <Stack.Screen name="factoids/[id]" />
            {/* Flowchart full screen above the tabs, its card, claim and saved-map sheets as form sheets, as in mock A. */}
            <Stack.Screen name="flowchart/index" />
            <Stack.Screen name="flowchart/card" options={sheet} />
            <Stack.Screen name="flowchart/claim" options={sheet} />
            <Stack.Screen name="flowchart/maps" options={sheet} />
            {/* Live practice screens, full screen with no tab bar, as the live round in mock 05. */}
            <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="timer-format" options={sheet} />
            <Stack.Screen name="speech-time" />
            <Stack.Screen name="motions" />
            <Stack.Screen name="crossfire" />
            <Stack.Screen name="crossfire-round/[id]" />
            <Stack.Screen name="sparring/index" />
            <Stack.Screen name="sparring/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={session === null}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
        <ToastHost />
        {/* The timer's signals and Live Activity keep going while the timer screen is closed. */}
        <TimerRunner />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
