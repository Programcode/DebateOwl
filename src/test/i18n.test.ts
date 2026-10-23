import { expect, test } from 'vitest';
import i18n, { applyAppLanguage } from '../i18n';
import { debateCountsLabel } from '../components/features/debate/CurrentDebateStrip';
import type { AppLanguage } from '../lib/languages';
import en from '../locales/en.json';
import es from '../locales/es.json';
import hu from '../locales/hu.json';
import toolsEn from '../locales/tools/en.json';
import toolsEs from '../locales/tools/es.json';
import toolsHu from '../locales/tools/hu.json';

function keys(catalog: object, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix + key;
    return typeof value === 'string' ? [path] : value && typeof value === 'object' ? keys(value, path + '.') : [];
  });
}

test('Spanish and Hungarian catalogs match English keys', () => {
  const english = keys(en).sort();
  expect(keys(es).sort()).toEqual(english);
  expect(keys(hu).sort()).toEqual(english);
});

test('Spanish and Hungarian free-tools catalogs match English keys', () => {
  const english = keys(toolsEn).sort();
  expect(keys(toolsEs).sort()).toEqual(english);
  expect(keys(toolsHu).sort()).toEqual(english);
});

test('count strings take the plural form of their count in every language', async () => {
  const expected = {
    en: ['1 source', '2 sources', '1 source (1 active) · 2 outputs'],
    es: ['1 fuente', '2 fuentes', '1 fuente (1 activa) · 2 resultados'],
    hu: ['1 forrás', '2 forrás', '1 forrás (1 aktív) · 2 eredmény'],
  };
  for (const [language, [one, two, counts]] of Object.entries(expected) as [AppLanguage, string[]][]) {
    await applyAppLanguage(language);
    expect(i18n.t('libraryPage.sourceCount', { count: 1 })).toBe(one);
    expect(i18n.t('libraryPage.sourceCount', { count: 2 })).toBe(two);
    expect(debateCountsLabel(i18n.t, { sources: 1, activeSources: 1, outputs: 2 })).toBe(counts);
  }
  await applyAppLanguage('en');
});

test('a later language choice wins over one whose strings are still loading', async () => {
  // Spanish has to be fetched; English is already there and applies at once.
  const spanish = applyAppLanguage('es');
  const english = applyAppLanguage('en');
  await Promise.all([spanish, english]);
  expect(i18n.language).toBe('en');
  expect(i18n.t('nav.settings')).toBe(en.nav.settings);

  await applyAppLanguage('hu');
  expect(i18n.language).toBe('hu');
  expect(i18n.t('nav.settings')).toBe(hu.nav.settings);
  expect(i18n.t('tools:embed.attribution')).toBe(toolsHu.embed.attribution);
});
