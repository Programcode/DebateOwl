import { describe, expect, it } from 'vitest';
import { formatEuropeanDate, formatEuropeanDateTime, formatEuropeanTime } from '@/lib/date-format';

describe('date-format', () => {
  it('formats dates as dd/mm/yyyy', () => {
    expect(formatEuropeanDate('2026-05-19T13:45:00.000Z')).toMatch(/^19\/05\/2026$/);
  });

  it('formats date-times with dd/mm/yyyy and 24-hour time', () => {
    expect(formatEuropeanDateTime('2026-05-19T13:45:00.000Z')).toMatch(/^19\/05\/2026, \d{2}:\d{2}$/);
  });

  it('formats time with 24-hour clock', () => {
    expect(formatEuropeanTime('2026-05-19T13:45:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns fallback for invalid values', () => {
    expect(formatEuropeanDate('bad-date', 'Unknown')).toBe('Unknown');
  });
});
