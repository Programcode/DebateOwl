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
  const date = value instanceof Date ? value : new Date(value);
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
