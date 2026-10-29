// Hermes has no Intl.PluralRules, and without it i18next cannot pick `_one`/`_other` keys
// and shows the raw key. The polyfill only installs where it is missing, so the web keeps
// the browser's. It must load before i18next initialises below.
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/hu.js';
// Nor Intl.ListFormat, which the debate context line joins its parts with ("3 sources and 2 results").
import '@formatjs/intl-listformat/polyfill.js';
import '@formatjs/intl-listformat/locale-data/en.js';
import '@formatjs/intl-listformat/locale-data/es.js';
import '@formatjs/intl-listformat/locale-data/hu.js';

import { isAppLanguage, type AppLanguage } from '@debatelab/core/languages';
import { getLocales } from 'expo-localization';
import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';

// The website's catalogs. App-only strings live under `mobile.*` in the same files.
import en from '../../../../src/locales/en.json';
// The free tools' catalogs (timer, speech-time calculator, motion generator), as the website's `tools` namespace.
import toolsEn from '../../../../src/locales/tools/en.json';

/** The device language when DebateLab has it, otherwise English. Signed in, the account's choice wins (see settings.tsx). */
export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return isAppLanguage(code) ? code : 'en';
}

/** Literal requires let Metro defer parsing the unused catalogs while keeping active keys synchronous. */
function resourcesFor(language: AppLanguage): ResourceLanguage {
  if (language === 'es') return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads a bundled JSON catalog synchronously on demand.
    translation: require('../../../../src/locales/es.json'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Same lazy tools namespace.
    tools: require('../../../../src/locales/tools/es.json'),
  };
  if (language === 'hu') return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads a bundled JSON catalog synchronously on demand.
    translation: require('../../../../src/locales/hu.json'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Same lazy tools namespace.
    tools: require('../../../../src/locales/tools/hu.json'),
  };
  return { translation: en, tools: toolsEn };
}

const initialLanguage = deviceLanguage();
// Both the active language and its English fallback are ready before the first t().
void i18n.use(initReactI18next).init({
  resources: { en: resourcesFor('en'), ...(initialLanguage === 'en' ? {} : { [initialLanguage]: resourcesFor(initialLanguage) }) },
  lng: initialLanguage,
  fallbackLng: 'en',
  initImmediate: false,
  interpolation: { escapeValue: false },
});

/** Load both namespaces before selecting a language, including the first offline switch to it. */
export function changeAppLanguage(language: AppLanguage) {
  if (!i18n.hasResourceBundle(language, 'translation')) {
    const resources = resourcesFor(language);
    for (const [namespace, catalog] of Object.entries(resources)) i18n.addResourceBundle(language, namespace, catalog);
  }
  return i18n.changeLanguage(language);
}

export default i18n;
