import { useTranslation } from 'react-i18next';
import { CreditCard, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatEuropeanDate } from '@/lib/date-format';
import type { BillingDateKind, BillingStateName } from '@/hooks/use-subscription';

// Tinted badges keep their label readable (white on amber or green was about 2:1).
const STATE_BADGES: Record<BillingStateName, { labelKey: string; color: string }> = {
  trial: { labelKey: 'settings.tierTrial', color: 'border-blue-500/30 bg-blue-500/15 text-blue-800 dark:text-blue-300' },
  extended_access: { labelKey: 'settings.tierExtended', color: 'border-success/30 bg-success/15 text-success' },
  pro: { labelKey: 'settings.tierPro', color: 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  pro_canceling: { labelKey: 'settings.tierPro', color: 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  payment_failed: { labelKey: 'settings.tierPaymentFailed', color: 'border-destructive/30 bg-destructive/10 text-destructive' },
  legacy_free: { labelKey: 'settings.tierLegacyFree', color: 'border-success/30 bg-success/15 text-success' },
  trial_ended: { labelKey: 'settings.tierExpired', color: 'border-destructive/30 bg-destructive/10 text-destructive' },
  subscription_ended: { labelKey: 'settings.tierExpired', color: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

// The short date beside the badge. A payment grace and an ended subscription
// get a sentence below instead.
const DATE_LABELS: Partial<Record<BillingDateKind, string>> = {
  ends: 'settings.endsOn',
  renews: 'settings.renewsOn',
  cancels: 'settings.cancelsOn',
};

export interface SubscriptionStatusProps {
  billingState: BillingStateName;
  billingDate: string | null;
  billingDateKind: BillingDateKind | null;
  hasOpenSubscription: boolean;
  hasStripeBilling: boolean;
  dailyLimit: number;
  portalLoading: boolean;
  onManage: () => void;
  onUpgrade: () => void;
}

/**
 * The plan badge, its date, what it means, and the one next step for the
 * Settings subscription card. While a Stripe subscription can still bill, the
 * step is Manage subscription (the portal), never a second Checkout.
 */
export function SubscriptionStatus({
  billingState,
  billingDate,
  billingDateKind,
  hasOpenSubscription,
  hasStripeBilling,
  dailyLimit,
  portalLoading,
  onManage,
  onUpgrade,
}: SubscriptionStatusProps) {
  const { t } = useTranslation();
  const badge = STATE_BADGES[billingState];
  const date = billingDate ? formatEuropeanDate(billingDate) : null;
  const dateLabel = billingDateKind ? DATE_LABELS[billingDateKind] : undefined;
  const isPro = billingState === 'pro' || billingState === 'pro_canceling';
  const canManage = hasOpenSubscription || (isPro && hasStripeBilling);

  const description = (() => {
    switch (billingState) {
      case 'extended_access':
        return t('settings.extendedAccessDesc', { count: dailyLimit });
      case 'payment_failed':
        return billingDateKind === 'grace_ends' && date
          ? `${t('settings.paymentFailedDesc')} ${t('settings.paymentGraceUntil', { date })}`
          : t('settings.paymentFailedNoAccess');
      case 'subscription_ended':
        return date ? t('settings.subscriptionEndedOn', { date }) : t('settings.subscriptionEnded');
      case 'trial_ended':
        return t('settings.accessExpired');
      default:
        return t('settings.accessActive');
    }
  })();

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={badge.color}>{t(badge.labelKey)}</Badge>
          {dateLabel && date && (
            <span data-testid="billing-date" className="text-sm text-muted-foreground">{t(dateLabel, { date })}</span>
          )}
        </div>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={onManage} disabled={portalLoading}>
            <CreditCard className="h-4 w-4 mr-2" />
            {portalLoading ? t('settings.loading') : t('settings.manageSubscription')}
          </Button>
        ) : (
          <Button size="sm" onClick={onUpgrade}>
            <Zap className="h-4 w-4 mr-2" />
            {billingState === 'subscription_ended'
              ? t('settings.resubscribe')
              : isPro ? t('settings.setUpBilling') : t('settings.upgradeToPro')}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{description}</p>
    </>
  );
}
