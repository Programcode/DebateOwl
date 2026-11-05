import { BRAND, type PageHead } from '@/lib/seo/pages';
import { FORMAT_NAMES, type DailyMotion } from './schedule';

export const ARCHIVE_PATH = '/motion';
export const dailyMotionPath = (number: number) => `${ARCHIVE_PATH}/${number}`;

export function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

export const formatName = (day: DailyMotion) => FORMAT_NAMES[day.format];

/** The day's head, shared with the prerender so the HTML and the browser agree. */
export function dailyMotionHead(day: DailyMotion): PageHead {
  const short = day.wording.replace(/^Resolved: /, '').replace(/\.$/, '');
  return {
    title: `Daily Motion #${day.number}: ${short} | ${BRAND}`,
    description: `Debate motion #${day.number}, set for ${formatName(day)} on ${longDate(day.date)}: speech times, what the round turns on, the strongest line for each side and what the ballot will turn on.`,
    canonicalPath: dailyMotionPath(day.number),
  };
}
