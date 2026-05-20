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
