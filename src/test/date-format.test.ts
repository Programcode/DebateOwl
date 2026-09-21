import { describe, expect, it } from 'vitest';
import { formatEuropeanDate, formatEuropeanDateTime, formatEuropeanTime, formatRelativeTime } from '@/lib/date-format';

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

describe('formatRelativeTime', () => {
  it('formats past and future across units', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000)).toBe('3 hours ago');
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000)).toBe('2 days ago');
    expect(formatRelativeTime(now + 5 * 60 * 1000)).toBe('in 5 minutes');
  });

  it('collapses sub-minute deltas to "this minute"', () => {
    expect(formatRelativeTime(Date.now() - 2000)).toBe('this minute');
  });

  it('returns the fallback for an invalid date', () => {
    expect(formatRelativeTime('not a date', 'n/a')).toBe('n/a');
  });
});
