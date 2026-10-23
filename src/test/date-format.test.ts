import { beforeAll, expect, test } from 'vitest';
import { loadAllAppLanguages } from '../i18n';
import { formatDecimal, formatEuropeanDate, formatEuropeanDateTime, formatNumber } from '../lib/date-format';

beforeAll(() => loadAllAppLanguages());

const OCT_23 = new Date(2026, 9, 23, 14, 5);

test('numbers group thousands in the active language, four-digit ones included', () => {
  expect(`40/${formatNumber(1200, 'en')}`).toBe('40/1,200');
  expect(`40/${formatNumber(1200, 'es')}`).toBe('40/1.200');
  expect(`40/${formatNumber(1200, 'hu')}`).toBe('40/1 200');
  expect(formatNumber(40, 'es')).toBe('40');
});

test('decimals use the language separator', () => {
  expect(formatDecimal(1.25, 1, 'en')).toBe('1.3');
  expect(formatDecimal(1.25, 1, 'es')).toBe('1,3');
  expect(formatDecimal(1.25, 1, 'hu')).toBe('1,3');
  expect(formatDecimal(12, 0, 'hu')).toBe('12');
});

test('dates name the month, so day and month cannot be confused', () => {
  expect(formatEuropeanDate(OCT_23, undefined, 'en')).toBe('23 Oct 2026');
  expect(formatEuropeanDate(OCT_23, undefined, 'es')).toBe('23 oct 2026');
  expect(formatEuropeanDate(OCT_23, undefined, 'hu')).toBe('2026. okt. 23.');
  expect(formatEuropeanDateTime(OCT_23, undefined, 'en')).toBe('23 Oct 2026, 14:05');
});

test('a missing date reads as not available in the language', () => {
  expect(formatEuropeanDate('not a date', undefined, 'en')).toBe('N/A');
  expect(formatEuropeanDate('not a date', undefined, 'es')).toBe('N/D');
  expect(formatEuropeanDate('not a date', undefined, 'hu')).toBe('nincs adat');
  expect(formatEuropeanDate('not a date', '—', 'hu')).toBe('—');
});
