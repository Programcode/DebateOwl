import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import hu from '@/locales/hu.json';
import {
  APP_LANGUAGES,
  isAppLanguage,
  languageName,
  toIntlLocale,
} from '@/lib/languages';
import { applyAppLanguage } from '@/i18n';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

function flattenValues(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenValues(value as Record<string, unknown>, path));
    } else {
      result[path] = String(value);
    }
  });
  return result;
}

const HU_IDENTICAL_VALUE_ALLOWLIST = new Set([
  'common.pdf', 'common.docx', 'common.googleDocs',
  'home.title', 'settings.tierPro', 'settings.admin',
  'login.googleTab', 'login.verificationCodePlaceholder', 'login.demoCodePlaceholder',
  'notFound.title', 'pricing.trialPrice', 'pricing.pro', 'pricing.proPrice',
  'generateForm.lengthStandard', 'generateResults.durationMs', 'generateResults.word',
  'generateResults.pdf', 'generateResults.googleDocs', 'generateResults.exordio',
  'pricingModal.pro', 'pricingModal.freePrice', 'pricingModal.proPrice',
  'timer.formatStandard', 'timer.formatLD',
  'timer.speeches.policy.1ac', 'timer.speeches.policy.1nc',
  'timer.speeches.policy.2ac', 'timer.speeches.policy.2nc',
  'timer.speeches.policy.1nr', 'timer.speeches.policy.1ar',
  'timer.speeches.policy.2nr', 'timer.speeches.policy.2ar',
  'export.exordio', 'sparring.format.ld', 'sparring.format.pf',
  'sparring.turns.standard-1', 'sparring.turns.standard-3',
  'sparring.turns.standard-5', 'sparring.turns.standard-7',
  'sparring.scorecard.exportPdf',
  'libraryPage.urlSource',
  'langSwitcher.en', 'langSwitcher.es', 'langSwitcher.hu',
]);

describe('i18n locale files', () => {
  const enKeys = flattenKeys(en);
  const esKeys = flattenKeys(es);
  const huKeys = flattenKeys(hu);

  it('all keys in en.json exist in es.json', () => {
    const esKeySet = new Set(esKeys);
    const missing = enKeys.filter(k => !esKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('all keys in en.json exist in hu.json', () => {
    const huKeySet = new Set(huKeys);
    const missing = enKeys.filter(k => !huKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('all keys in es.json exist in en.json', () => {
    const enKeySet = new Set(enKeys);
    const missing = esKeys.filter(k => !enKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('all keys in hu.json exist in en.json', () => {
    const enKeySet = new Set(enKeys);
    const missing = huKeys.filter(k => !enKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('no empty string values in en.json', () => {
    const values = flattenValues(en);
    const empty = Object.entries(values).filter(([, v]) => v === '');
    expect(empty).toEqual([]);
  });

  it('no empty string values in es.json', () => {
    const values = flattenValues(es);
    const empty = Object.entries(values).filter(([, v]) => v === '');
    expect(empty).toEqual([]);
  });

  it('no empty string values in hu.json', () => {
    const values = flattenValues(hu);
    const empty = Object.entries(values).filter(([, v]) => v === '');
    expect(empty).toEqual([]);
  });

  it('has Hungarian copy for every non-canonical English value', () => {
    const enValues = flattenValues(en);
    const huValues = flattenValues(hu);
    const untranslated = Object.keys(enValues).filter((key) => (
      enValues[key] === huValues[key] && !HU_IDENTICAL_VALUE_ALLOWLIST.has(key)
    ));

    expect(untranslated).toEqual([]);
  });

  it('names both observability processors in every privacy policy translation', () => {
    for (const locale of [en, es, hu]) {
      expect(locale.privacyPage.p7).toContain('PostHog');
      expect(locale.privacyPage.p7).toContain('Sentry');
    }
  });
});

describe('i18n runtime', () => {
  it('defines the complete typed language catalog', () => {
    expect(Object.keys(APP_LANGUAGES)).toEqual(['en', 'es', 'hu']);
    expect(isAppLanguage('hu')).toBe(true);
    expect(isAppLanguage('zz')).toBe(false);
    expect(isAppLanguage(undefined)).toBe(false);
    expect(toIntlLocale('hu')).toBe('hu-HU');
    expect(languageName('hu')).toBe('Hungarian');
  });

  it('applies Hungarian to i18n and browser metadata', async () => {
    const languageMeta = document.createElement('meta');
    languageMeta.setAttribute('name', 'language');
    document.head.append(languageMeta);

    await applyAppLanguage('hu');

    expect(i18n.language).toBe('hu');
    expect(document.documentElement.lang).toBe('hu');
    expect(languageMeta.content).toBe('Hungarian');
    expect(document.title).toBe(hu.home.title);

    languageMeta.remove();
    await applyAppLanguage('en');
  });

  it('i18n.t resolves English nav values', () => {
    expect(i18n.t('nav.home')).toBe('Home');
    expect(i18n.t('nav.generate')).toBe('Generate');
    expect(i18n.t('nav.settings')).toBe('Settings');
  });

  it('i18n.changeLanguage works for es', async () => {
    await i18n.changeLanguage('es');
    expect(i18n.language).toBe('es');
    await i18n.changeLanguage('en');
  });

  it('i18n.changeLanguage works for hu', async () => {
    await i18n.changeLanguage('hu');
    expect(i18n.language).toBe('hu');
    await i18n.changeLanguage('en');
  });

  it('interpolation works for limitModal.limitReachedDesc', () => {
    const result = i18n.t('limitModal.limitReachedDesc', { current: 5, limit: 10 });
    expect(result).toContain('5');
    expect(result).toContain('10');
  });

  it('interpolation works for modelModal.descriptionWithModel', () => {
    const result = i18n.t('modelModal.descriptionWithModel', { model: 'GPT-5' });
    expect(result).toContain('GPT-5');
  });

  it('pluralizes the Crossfire character counter in every locale', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('crossfire.charactersRemaining', { count: 1 })).toBe('1 character remaining');
    expect(i18n.t('crossfire.charactersRemaining', { count: 2 })).toBe('2 characters remaining');
    await i18n.changeLanguage('es');
    expect(i18n.t('crossfire.charactersRemaining', { count: 1 })).toBe('Queda 1 carácter');
    expect(i18n.t('crossfire.charactersRemaining', { count: 2 })).toBe('Quedan 2 caracteres');
    await i18n.changeLanguage('hu');
    expect(i18n.t('crossfire.charactersRemaining', { count: 1 })).toBe('1 karakter maradt');
    expect(i18n.t('crossfire.charactersRemaining', { count: 2 })).toBe('2 karakter maradt');
    await i18n.changeLanguage('en');
  });

  it('fallback language is en', () => {
    expect(i18n.options.fallbackLng).toContain('en');
  });
});
