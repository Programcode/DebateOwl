import '@/lib/i18n';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { interFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts(interFonts);
  const { session, loading, settled } = useAuth();
  const { scheme, colors } = useTheme();
  const ready = (fontsLoaded || fontError !== null) && !loading;

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
