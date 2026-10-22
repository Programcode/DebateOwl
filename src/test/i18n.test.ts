import { expect, test } from 'vitest';
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
