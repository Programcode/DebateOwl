const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calendar days from today to a trial's end on the reader's clock; 0 on its
 * last day, null once it has ended or when the date cannot be read. The
 * website's trial banner and the app's share it.
 */
export function trialDaysLeft(endsAt: string, now = new Date()): number | null {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDay(end) - startOfDay(now)) / DAY_MS);
}
