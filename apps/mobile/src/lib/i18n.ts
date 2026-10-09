// Hermes has no Intl.PluralRules, and without it i18next cannot pick `_one`/`_other` keys
// and shows the raw key. The polyfill only installs where it is missing, so the web keeps
// the browser's. It must load before i18next initialises below.
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/hu.js';

import { isAppLanguage, type AppLanguage } from '@debatelab/core/languages';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// The website's catalogs. App-only strings live under `mobile.*` in the same files.
import en from '../../../../src/locales/en.json';
import es from '../../../../src/locales/es.json';
import hu from '../../../../src/locales/hu.json';

/** The device language when DebateLab has it, otherwise English. Signed in, the account's choice wins (see settings.tsx). */
export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return isAppLanguage(code) ? code : 'en';
}

// Bundled resources make init synchronous; the returned promise cannot reject.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, hu: { translation: hu } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
