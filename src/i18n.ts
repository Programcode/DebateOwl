import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import hu from './locales/hu.json';
import toolsEn from './locales/tools/en.json';
import toolsEs from './locales/tools/es.json';
import toolsHu from './locales/tools/hu.json';
import { type AppLanguage } from './lib/languages';

// Bundled resources make init synchronous; the returned promise cannot reject.
void i18n.use(initReactI18next).init({
  // The free /tools pages keep their strings in their own namespace.
  resources: {
    en: { translation: en, tools: toolsEn },
    es: { translation: es, tools: toolsEs },
    hu: { translation: hu, tools: toolsHu },
  },
  ns: ['translation', 'tools'],
  defaultNS: 'translation',
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (typeof document === 'undefined') return;

  document.documentElement.lang = language;
}

export default i18n;
