import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Zap, Clock } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';

interface LimitReachedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: 'limit_reached' | 'trial_expired';
  limit?: number;
  current?: number;
  onUpgrade: () => void;
}

export function LimitReachedModal({ open, onOpenChange, variant, limit, current, onUpgrade }: LimitReachedModalProps) {
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const isTrialExpired = variant === 'trial_expired';
  // A Pro student who used today's included requests already pays. Selling Pro again is the wrong next step.
  const paidDailyCap = isPro && !isTrialExpired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
            {isTrialExpired ? (
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <DialogTitle className="text-center">
            {isTrialExpired ? t('limitModal.trialEnded') : t('limitModal.limitReached')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isTrialExpired
              ? t('limitModal.trialEndedDesc')
              : t('limitModal.limitReachedDesc', { current: current || 0, limit: limit || 0 })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-4">
          {paidDailyCap ? (
            <Button onClick={() => onOpenChange(false)} size="lg" className="w-full">
              {t('limitModal.gotIt')}
            </Button>
          ) : (
            <>
              <Button onClick={onUpgrade} size="lg" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                {t('limitModal.upgrade')}
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
