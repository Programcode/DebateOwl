import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adam.debatelab',
  appName: 'DebateLab',
  webDir: 'dist',
  ios: {
    scheme: 'DebateLab',
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  server: {
    iosScheme: 'capacitor',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'DEFAULT',
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0f172a',
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
