import { Appearance } from 'react-native';

/** Native controls, sheets and the tab bar follow the theme chosen in You, not only the system's. */
export function applyColorScheme(theme: 'light' | 'dark' | 'system') {
  Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
}
