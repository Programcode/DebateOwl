import { isAppLanguage, toIntlLocale, type AppLanguage } from '@debatelab/core/languages';
import { formatDistanceToNow, formatRelative, isToday } from 'date-fns';
import { enGB, es, hu } from 'date-fns/locale';

import i18n from './i18n';

const LOCALES = { en: enGB, es, hu } as const;

function language(): AppLanguage {
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
}

/** "3 weeks ago", as the website's formatRelativeDate. */
export function formatRelativeDate(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true, locale: LOCALES[language()] });
}

/** "today at 16:43", "yesterday at 09:10", then a date. */
export function formatWhen(value: number): string {
  return formatRelative(value, Date.now(), { locale: LOCALES[language()] });
}

export { isToday };

/** A day like 31/12/2026, as the website's formatEuropeanDate. */
export function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(toIntlLocale(language()), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
