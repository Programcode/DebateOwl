export const APP_LANGUAGES = {
  en: { label: 'English', intlLocale: 'en-GB', aiName: 'English' },
  es: { label: 'Español', intlLocale: 'es-ES', aiName: 'Spanish' },
  hu: { label: 'Magyar', intlLocale: 'hu-HU', aiName: 'Hungarian' },
} as const;

export type AppLanguage = keyof typeof APP_LANGUAGES;

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(APP_LANGUAGES, value);
}

export function toIntlLocale(language: AppLanguage): string {
  return APP_LANGUAGES[language].intlLocale;
}

export function languageName(language: AppLanguage): string {
  return APP_LANGUAGES[language].aiName;
}
