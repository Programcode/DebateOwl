import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.debatelab.mobile',
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
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
