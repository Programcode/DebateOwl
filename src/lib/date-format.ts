const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toValidDate(value: Date | number | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Date-only strings (e.g. "2026-05-20") are parsed as UTC midnight by spec.
  // Append T00:00 so they're treated as local time instead.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    value = value + 'T00:00';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEuropeanDate(value: Date | number | string, fallback = 'N/A'): string {
  const date = toValidDate(value);
  return date ? DATE_FORMATTER.format(date) : fallback;
}

export function formatEuropeanDateTime(value: Date | number | string, fallback = 'N/A'): string {
  const date = toValidDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : fallback;
}

export function formatEuropeanTime(value: Date | number | string, fallback = ''): string {
  const date = toValidDate(value);
  return date ? TIME_FORMATTER.format(date) : fallback;
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** "3 hours ago" / "in 2 days". Falls back to "just now" under a minute. */
export function formatRelativeTime(value: Date | number | string, fallback = ''): string {
  const date = toValidDate(value);
  if (!date) return fallback;

  const deltaMs = date.getTime() - Date.now();
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= unitMs) {
      return RELATIVE_FORMATTER.format(Math.round(deltaMs / unitMs), unit);
    }
  }
  return RELATIVE_FORMATTER.format(0, 'minute');
}
