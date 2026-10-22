import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SessionCostNoteProps {
  units: number | null;
  remaining: number | null;
  /** Why a new round would be refused, already translated. Shown instead of the cost. */
  blocked?: string | null;
  className?: string;
}

/**
 * "This round costs 1 AI request, however many turns it takes. You have N left today."
 * Says nothing while the cost is unknown: an older server charges per call.
 */
export function SessionCostNote({ units, remaining, blocked = null, className }: SessionCostNoteProps) {
  const { t } = useTranslation();
  if (!blocked && units === null) return null;
  if (blocked) {
    return (
      <p data-testid="session-cost" role="status" className={cn('rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200', className)}>
        {blocked}
      </p>
    );
  }
  return (
    <p data-testid="session-cost" className={cn('text-xs leading-5 text-muted-foreground', className)}>
      {t('sessionQuota.cost', { count: units })}
      {remaining !== null && ` ${t('sessionQuota.remaining', { count: remaining })}`}
    </p>
  );
}
