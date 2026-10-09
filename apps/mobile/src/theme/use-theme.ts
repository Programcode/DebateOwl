import { palette } from './colors';
import { useColorScheme } from './use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palette[scheme] } as const;
}
