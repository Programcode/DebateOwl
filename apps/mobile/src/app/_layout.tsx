import '@/lib/i18n';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { DebateProvider } from '@/lib/debate-context';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { interFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <DebateProvider>
          <Root />
        </DebateProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts(interFonts);
  const { session, loading, settled } = useAuth();
  const { ready: settingsReady } = useSettings();
  const { scheme, colors } = useTheme();
  // Settings come from the device here, so the app opens in the account's language and theme.
  const ready = (fontsLoaded || fontError !== null) && !loading && settingsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

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
      {/* The screenshot script waits for auth-settled before it checks an offline cold start. */}
      <View style={styles.root} testID={settled ? 'auth-settled' : 'auth-pending'}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={session !== null}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={session === null}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
