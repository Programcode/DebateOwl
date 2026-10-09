import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

/** Static web pages render before the browser's theme is known, so start light and switch after hydration. */
export function useColorScheme() {
  const [hydrated, setHydrated] = useState(false);
  const scheme = useSystemColorScheme();

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? scheme : 'light';
}
