import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatEuropeanDate, formatEuropeanDateTime, formatEuropeanTime, formatNumber, formatRelativeDate } from '@/lib/date-format';

describe('date-format', () => {
  afterEach(() => vi.useRealTimers());

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

  it('formats Hungarian dates, date-times, times, and numbers', () => {
    const localDate = new Date(2026, 4, 19, 13, 45);
    expect(formatEuropeanDate(localDate, 'N/A', 'hu')).toBe('2026. 05. 19.');
    expect(formatEuropeanDateTime(localDate, 'N/A', 'hu')).toBe('2026. 05. 19. 13:45');
    expect(formatEuropeanTime(localDate, '', 'hu')).toBe('13:45');
    expect(formatNumber(1234, 'hu')).toBe('1234');
  });

  it('formats relative dates in Hungarian', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 13, 45));
    expect(formatRelativeDate(new Date(2026, 4, 19, 12, 45), 'hu')).toBe('körülbelül 1 órával ezelőtt');
  });
});
