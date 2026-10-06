import { expect, test } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import hu from '../locales/hu.json';
import i18n from '../i18n';

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

test('Hungarian count keys resolve through i18next', async () => {
  await i18n.changeLanguage('hu');
  try {
    expect(i18n.t('askChat.messageCount', { count: 1 })).toBe('1 üzenet');
    expect(i18n.t('askChat.messageCount', { count: 2 })).toBe('2 üzenet');
  } finally {
    await i18n.changeLanguage('en');
  }
});
