import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import hu from './locales/hu.json';
import { languageName, type AppLanguage } from './lib/languages';

// Bundled resources make init synchronous; the returned promise cannot reject.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, hu: { translation: hu } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (typeof document === 'undefined') return;

  document.documentElement.lang = language;
  document.querySelector<HTMLMetaElement>('meta[name="language"]')?.setAttribute('content', languageName(language));
}

export default i18n;
