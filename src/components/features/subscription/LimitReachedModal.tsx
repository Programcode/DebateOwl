import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Zap, Clock, CreditCard } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { formatEuropeanDate } from '@/lib/date-format';
import { subscriptionLimitMessage } from '@/lib/ai/error-display';
import { BILLING_ACTION_LABELS } from '@/lib/billing/plan';
import { PLAN_DIALOG_CLASS, PLAN_DIALOG_CLOSE_CLASS } from './dialog-layout';

/** trial_expired is what functions older than the other access codes sent; it shows as trial_ended. */
export type LimitModalVariant =
  | 'limit_reached'
  | 'trial_ended'
  | 'trial_expired'
  | 'payment_failed'
  | 'subscription_ended'
  | 'weekly_budget_reached';

interface LimitReachedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: LimitModalVariant;
  limit?: number;
  current?: number;
  /** Quota units the refused request needed; above 1 for expensive models. */
  units?: number;
  onUpgrade: () => void;
}

const TITLES: Record<LimitModalVariant, string> = {
  limit_reached: 'limitModal.limitReached',
  trial_ended: 'limitModal.trialEnded',
  trial_expired: 'limitModal.trialEnded',
  payment_failed: 'limitModal.paymentFailed',
  subscription_ended: 'limitModal.subscriptionEnded',
  weekly_budget_reached: 'limitModal.weeklyReached',
};

export function LimitReachedModal({ open, onOpenChange, variant, limit, current, units, onUpgrade }: LimitReachedModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isPro, billingState, billingDate } = useSubscription();
  const accessEnded = variant === 'trial_ended' || variant === 'trial_expired' || variant === 'subscription_ended';
  const isWeeklyBudget = variant === 'weekly_budget_reached';
  // A Pro student who used today's included requests already pays. Selling Pro again is the wrong next step.
  const paidDailyCap = isPro && variant === 'limit_reached';

  const endedOn = variant === 'subscription_ended' && billingState === 'subscription_ended' && billingDate
    ? formatEuropeanDate(billingDate)
    : null;
  const description = endedOn
    ? t('limitModal.subscriptionEndedOnDesc', { date: endedOn })
    : subscriptionLimitMessage({ code: variant, limit, current, units });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${PLAN_DIALOG_CLASS} sm:max-w-[420px]`} closeClassName={PLAN_DIALOG_CLOSE_CLASS}>
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
            {accessEnded ? (
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <DialogTitle className="text-center">{t(TITLES[variant])}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-4">
          {variant === 'payment_failed' ? (
            // Stripe is still retrying the subscription they have; a second
            // Checkout would charge twice. Settings opens the billing portal.
            <>
              <Button onClick={() => { onOpenChange(false); navigate('/app/settings'); }} size="lg" className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                {t('limitModal.updatePayment')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                {t('limitModal.notNow', 'Not now')}
              </Button>
            </>
          ) : isWeeklyBudget || paidDailyCap ? (
            // Upgrading does not lift the spend cap, and a paid plan already has Pro.
            <Button onClick={() => onOpenChange(false)} size="lg" className="w-full">
              {isWeeklyBudget ? t('limitModal.ok') : t('limitModal.gotIt')}
            </Button>
          ) : (
            <>
              <Button onClick={onUpgrade} size="lg" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                {t(variant === 'subscription_ended' ? BILLING_ACTION_LABELS.resubscribe : BILLING_ACTION_LABELS.upgrade)}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                {t('limitModal.notNow', 'Not now')}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-1">
                {t('limitModal.upgradeNote')}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
