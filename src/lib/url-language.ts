import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { pathLanguage } from '@/lib/seo/localized-routes';

/** The language a `?lang=es` (or hu, en) link asks for, or null. */
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
 * Switches to the language a `?lang=` link asks for, kept on this device and,
 * when signed in, on the account, like a switcher choice. Returns whether the
 * address asked for one.
 */
export function chooseUrlLanguage(search: string): boolean {
  const language = urlLanguage(search);
  if (!language) return false;
  useSettingsStore.getState().chooseLinkedLanguage(language);
  return true;
}

/**
 * Switches to the language of a Hungarian or Spanish address (/hu,
 * /es/tools/…), the same way as a ?lang= link. English addresses keep the
 * visitor's own choice. Returns whether the path picked one.
 */
export function choosePathLanguage(pathname: string): boolean {
  const language = pathLanguage(pathname);
  if (!language) return false;
  useSettingsStore.getState().chooseLinkedLanguage(language);
  return true;
}
