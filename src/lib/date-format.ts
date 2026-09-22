import { formatDistanceToNow } from 'date-fns';
import { enGB, es, hu } from 'date-fns/locale';
import i18n from '@/i18n';
import { isAppLanguage, toIntlLocale, type AppLanguage } from '@/lib/languages';

interface LocaleFormatters {
  date: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  number: Intl.NumberFormat;
}

function createFormatters(language: AppLanguage): LocaleFormatters {
  const locale = toIntlLocale(language);
  return {
    date: new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    dateTime: new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    number: new Intl.NumberFormat(locale),
  };
}

const FORMATTERS: Record<AppLanguage, LocaleFormatters> = {
  en: createFormatters('en'),
  es: createFormatters('es'),
  hu: createFormatters('hu'),
};

const DATE_FNS_LOCALES = { en: enGB, es, hu } as const;

function activeLanguage(): AppLanguage {
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
}

function toValidDate(value: Date | number | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Date-only strings (e.g. "2026-05-20") are parsed as UTC midnight by spec.
  // Append T00:00 so they're treated as local time instead.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    value += 'T00:00';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEuropeanDate(
  value: Date | number | string,
  fallback = 'N/A',
  language: AppLanguage = activeLanguage(),
): string {
  const date = toValidDate(value);
  return date ? FORMATTERS[language].date.format(date) : fallback;
}

export function formatEuropeanDateTime(
  value: Date | number | string,
  fallback = 'N/A',
  language: AppLanguage = activeLanguage(),
): string {
  const date = toValidDate(value);
  return date ? FORMATTERS[language].dateTime.format(date) : fallback;
}

export function formatEuropeanTime(
  value: Date | number | string,
  fallback = '',
  language: AppLanguage = activeLanguage(),
): string {
  const date = toValidDate(value);
  return date ? FORMATTERS[language].time.format(date) : fallback;
}

export function formatNumber(value: number, language: AppLanguage = activeLanguage()): string {
  return FORMATTERS[language].number.format(value);
}

export function formatRelativeDate(
  value: Date | number | string,
  language: AppLanguage = activeLanguage(),
  fallback = 'N/A',
): string {
  const date = toValidDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true, locale: DATE_FNS_LOCALES[language] }) : fallback;
}
