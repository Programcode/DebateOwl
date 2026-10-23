import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import { useSettingsStore } from '@/lib/stores/settings-store';

/** The language a `?lang=es` (or hu, en) link asks for, or null. /es and /hu redirect to one. */
export function urlLanguage(search: string): AppLanguage | null {
  const value = new URLSearchParams(search).get('lang')?.trim().toLowerCase();
  return value && isAppLanguage(value) ? value : null;
}

/** The query string without `lang`: '' when nothing else is left. */
export function searchWithoutLanguage(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('lang');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * Switches to the language a `?lang=` link asks for, the way the language
 * switcher does: kept on this device and, when signed in, on the account.
 * Returns whether the address asked for one.
 */
export function chooseUrlLanguage(search: string): boolean {
  const language = urlLanguage(search);
  if (!language) return false;
  const settings = useSettingsStore.getState();
  if (settings.language !== language) settings.setLanguage(language);
  return true;
}
