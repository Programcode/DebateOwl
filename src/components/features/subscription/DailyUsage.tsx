import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/use-subscription';
import { cn } from '@/lib/utils';

/** The next midnight UTC, when the daily AI uses refresh, on the reader's clock. */
function dailyResetTime(locale: string): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return reset.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * "3 of 5 AI uses left today": the server's weighted counter, the number it
 * enforces, so a tool page and Settings always agree (QB-03). Says nothing
 * while the count is unknown or the account has no daily uses.
 */
export function DailyUsage({ showReset = false, className }: { showReset?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const { remainingToday, dailyLimit } = useSubscription();
  if (remainingToday === null || dailyLimit <= 0) return null;
  const remaining = t('dailyLimit.remaining', { count: remainingToday, limit: dailyLimit });
  return (
    <p data-testid="daily-usage" className={cn('text-sm text-muted-foreground', className)}>
      {showReset ? `${remaining}. ${t('dailyLimit.resets', { time: dailyResetTime(i18n.language) })}` : remaining}
    </p>
  );
}
