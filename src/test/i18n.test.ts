import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import hu from '@/locales/hu.json';

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

describe('i18n locale files', () => {
  const enKeys = flattenKeys(en);
  const esKeys = flattenKeys(es);
  const huKeys = flattenKeys(hu);

  it('en.json has keys', () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it('es.json has keys', () => {
    expect(esKeys.length).toBeGreaterThan(0);
  });

  it('hu.json has keys', () => {
    expect(huKeys.length).toBeGreaterThan(0);
  });

  it('all 3 locale files have same number of keys', () => {
    expect(enKeys.length).toBe(esKeys.length);
    expect(enKeys.length).toBe(huKeys.length);
  });

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

  it('names both observability processors in every privacy policy translation', () => {
    for (const locale of [en, es, hu]) {
      expect(locale.privacyPage.p7).toContain('PostHog');
      expect(locale.privacyPage.p7).toContain('Sentry');
    }
  });
});

describe('i18n runtime', () => {
  it('i18n.t returns correct English value for nav.home', () => {
    expect(i18n.t('nav.home')).toBe('Home');
  });

  it('i18n.t returns correct English value for nav.generate', () => {
    expect(i18n.t('nav.generate')).toBe('Generate');
  });

  it('i18n.t returns correct English value for nav.settings', () => {
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

  it('i18n.changeLanguage back to en', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
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
