import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { BILLING_ACTION_LABELS, billingAction } from '@/lib/billing/plan';
import { PricingModal } from './PricingModal';
import { trialDaysLeft } from '@debatelab/core/trial';

function dismissedKey(userId: string, endsAt: string) {
  return `debatelab:trial-banner-dismissed:${userId}:${endsAt}`;
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * "Free trial: 2 days left." A slim line under the header while a trial runs
 * (QB-09). Dismissing it hides it for this trial on this browser; a new trial
 * end date shows it again.
 */
export function TrialBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const subscription = useSubscription();
  const { billingState, billingDate, billingDateKind } = subscription;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  const key = user && billingState === 'trial' && billingDateKind === 'ends' && billingDate
    ? dismissedKey(user.id, billingDate)
    : null;
  const daysLeft = billingDate ? trialDaysLeft(billingDate) : null;
  if (!key || daysLeft === null || dismissed === key || readDismissed(key)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // Private browsing: hidden until the next page load.
    }
    setDismissed(key);
  };

  return (
    <section
      data-testid="trial-banner"
      aria-label={t('settings.tierTrial')}
      className="border-b border-blue-500/20 bg-blue-500/6"
    >
      <div className="container flex items-center gap-2 px-4 text-sm">
        <Clock className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 py-2 text-foreground">
          {daysLeft === 0 ? t('trialBanner.endsToday') : t('trialBanner.daysLeft', { count: daysLeft })}
        </p>
        <Button variant="link" size="sm" className="h-11 shrink-0 px-2" onClick={() => setPricingOpen(true)}>
          {/* The dialog's own next step: Manage while a past-due subscription still bills. */}
          {t(BILLING_ACTION_LABELS[billingAction(subscription)])}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={dismiss}
          aria-label={t('trialBanner.dismiss')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {pricingOpen && <PricingModal open onOpenChange={setPricingOpen} />}
    </section>
  );
}
