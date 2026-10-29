import '@/lib/i18n';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppSidebar } from '@/components/app-sidebar';
import { KeyboardDoneBar } from '@/components/app-text-input';
import { TimerRunner } from '@/components/timer-runner';
import { ToastHost, ToastProvider } from '@/components/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useApplePlatform } from '@/lib/use-apple-platform';
import { useHandoff } from '@/lib/handoff';
import { DebateProvider } from '@/lib/debate-context';
import { useFirstRun } from '@/lib/use-first-run';
import { useKeyCommand } from '@/lib/key-commands';
import { useQuickActions } from '@/lib/quick-actions';
import { useShareIntent } from '@/lib/share-intent';
import { useOfflineQueue } from '@/lib/use-offline-queue';
import { ReservedWidth, useSidebarWidth } from '@/lib/layout';
import { watchNetwork } from '@/lib/network-status';
import { refreshPush } from '@/lib/push';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { appFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

// A screen opened straight from a link (a share link, the widget, a quick action) has the tabs
// beneath it, so Back and the iPad sidebar always have the tabs to return to.
export const unstable_settings = { anchor: '(tabs)' };

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
  // A full-screen iPad window lists every tool in a sidebar beside the stack, so it stays while a tool is open.
  const sidebarWidth = useSidebarWidth();
  // Settings come from the device here, so the app opens in the account's language and theme.
  const ready = (fontsLoaded || fontError !== null) && !loading && settingsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Offline, reads answer from saved copies and the screens say so.
  useEffect(() => watchNetwork(), []);
  // Notes, source edits and Active switches made offline sync when the connection returns.
  useOfflineQueue();

  // A phone that opted in registers again on launch and when the language changes (see refreshPush).
  const userId = session?.user.id;
  useFirstRun(ready ? userId ?? null : null);
  // Notification taps, Live Activity cleanup, purchases and Handoff (use-apple-platform.ts).
  useApplePlatform(ready, userId ?? null);
  // Handoff: the open screen continues on a Mac (debateowl.com) or an iPad (development build only).
  useHandoff(ready);
  // Home Screen quick actions (development build with expo-quick-actions; nothing in Expo Go).
  useQuickActions(ready);
  // Text and pages shared from other apps (development build with the share extension; nothing in Expo Go).
  useShareIntent(ready);
  // iPad hardware keyboard: ⌘N starts a debate, ⌘K opens the switcher (key-commands.ts).
  const router = useRouter();
  useKeyCommand('cmd+n', () => router.push('/new-debate'), ready && Boolean(userId));
  useKeyCommand('cmd+k', () => router.push('/debates'), ready && Boolean(userId));
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
        <View style={styles.row}>
        {session !== null && sidebarWidth > 0 ? <AppSidebar width={sidebarWidth} /> : null}
        <ReservedWidth.Provider value={session !== null ? sidebarWidth : 0}>
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
            {/* Basic and Pro through the App Store (purchases.ts). */}
            <Stack.Screen name="plans" options={{ ...sheet, sheetAllowedDetents: [1] }} />
            {/* Ollie's welcome and the first-run tour, at full height so the owl and the buttons both fit. */}
            <Stack.Screen name="welcome" options={{ ...sheet, sheetAllowedDetents: [1] }} />
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
            <Stack.Screen name="flow-sheet" />
            <Stack.Screen name="motions" />
            <Stack.Screen name="crossfire" />
            <Stack.Screen name="crossfire-round/[id]" />
            <Stack.Screen name="sparring/index" />
            <Stack.Screen name="sparring/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={session === null}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          {/* A shared link opens signed in or out; after the sign-in group, so a signed-out launch still starts on sign-in. */}
          <Stack.Screen name="share/[code]" />
        </Stack>
        </ReservedWidth.Provider>
        </View>
        <ToastHost />
        {/* The timer's signals and Live Activity keep going while the timer screen is closed. */}
        <TimerRunner />
        <KeyboardDoneBar />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
});
