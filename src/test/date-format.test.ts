import { describe, expect, it } from 'vitest';
import { formatEuropeanDate, formatEuropeanDateTime, formatEuropeanTime } from '@/lib/date-format';

describe('date-format', () => {
  it('formats dates as dd/mm/yyyy', () => {
    const localDate = new Date(2026, 4, 19, 13, 45);
    expect(formatEuropeanDate(localDate)).toBe('19/05/2026');
  });

  it('formats date-times with dd/mm/yyyy and 24-hour time', () => {
    const localDate = new Date(2026, 4, 19, 13, 45);
    expect(formatEuropeanDateTime(localDate)).toBe('19/05/2026, 13:45');
  });

  it('formats time with 24-hour clock', () => {
    const localDate = new Date(2026, 4, 19, 13, 45);
    expect(formatEuropeanTime(localDate)).toBe('13:45');
  });

  it('returns fallback for invalid values', () => {
    expect(formatEuropeanDate('bad-date', 'Unknown')).toBe('Unknown');
  });
});
