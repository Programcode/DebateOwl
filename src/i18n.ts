import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import toolsEn from './locales/tools/en.json';
import site from './config/site.json';
import { type AppLanguage } from './lib/languages';

type Catalogs = [{ default: object }, { default: object }];

// English ships in the entry: it is the default and every other language's
// fallback. Spanish and Hungarian are their own chunks, fetched only when chosen.
const CATALOGS: Record<Exclude<AppLanguage, 'en'>, () => Promise<Catalogs>> = {
  es: () => Promise.all([import('./locales/es.json'), import('./locales/tools/es.json')]),
  hu: () => Promise.all([import('./locales/hu.json'), import('./locales/tools/hu.json')]),
};

// Bundled resources make init synchronous; the returned promise cannot reject.
void i18n.use(initReactI18next).init({
  // The free /tools pages keep their strings in their own namespace.
  resources: {
    en: { translation: en, tools: toolsEn },
  },
  ns: ['translation', 'tools'],
  defaultNS: 'translation',
  lng: 'en',
  fallbackLng: 'en',
  // Every string can name the product with {{product}}, {{brand}} and {{host}},
  // and state the trial length and price with {{trialDays}} and {{proMonthly}},
  // all from site.json, so every language states the same facts as the English pages.
  interpolation: {
    escapeValue: false,
    defaultVariables: {
      product: site.product,
      brand: site.brand,
      host: new URL(site.origin).host,
      trialDays: site.pricing.trialDays,
      proMonthly: site.pricing.proMonthly,
    },
  },
});

/** Whether the language's strings are in i18next, fetching them first if needed. */
async function loadCatalogs(language: AppLanguage): Promise<boolean> {
  if (language === 'en' || i18n.hasResourceBundle(language, 'translation')) return true;
  try {
    const [app, tools] = await CATALOGS[language]();
    i18n.addResourceBundle(language, 'translation', app.default);
    i18n.addResourceBundle(language, 'tools', tools.default);
    return true;
  } catch (error) {
    // Offline before this language was ever cached: stay on the current one.
    console.warn(`[i18n] Could not load the ${language} strings:`, error);
    return false;
  }
}

/**
 * Fetches every language's strings without switching to any of them. The
 * flowchart recognises starter text saved in any language, so its page waits
 * for this.
 */
export async function loadAllAppLanguages(): Promise<void> {
  await Promise.all((Object.keys(CATALOGS) as AppLanguage[]).map(loadCatalogs));
}

let requestedLanguage: AppLanguage = 'en';
let pendingLanguage: Promise<void> = Promise.resolve();

export function applyAppLanguage(language: AppLanguage): Promise<void> {
  requestedLanguage = language;
  pendingLanguage = (async () => {
    // A later choice wins, even if this one's strings arrive after it.
    if (!(await loadCatalogs(language)) || requestedLanguage !== language) return;
    await i18n.changeLanguage(language);
    if (typeof document === 'undefined') return;

    document.documentElement.lang = language;
  })();
  return pendingLanguage;
}

// A language chosen offline, before its strings were ever cached, stays on the
// current one; try again when the connection returns.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (i18n.language !== requestedLanguage) void applyAppLanguage(requestedLanguage);
  });
}

/**
 * Settles once the last requested language is showing (or has failed to load).
 * The first render waits for it, so a Spanish or Hungarian visitor never sees
 * English first.
 */
export function appLanguageReady(): Promise<void> {
  return pendingLanguage;
}

export default i18n;
