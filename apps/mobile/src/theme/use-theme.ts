import { palette } from './colors';
import { useColorScheme } from './use-color-scheme';

import { useSettings } from '@/lib/settings';

/** The theme chosen in You, or the system's when it is System. */
export function useTheme() {
  const { theme } = useSettings();
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = theme === 'system' ? system : theme;
  return { scheme, colors: palette[scheme] } as const;
}
