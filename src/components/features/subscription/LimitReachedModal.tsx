import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Zap, Clock } from 'lucide-react';

interface LimitReachedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: 'limit_reached' | 'trial_expired';
  limit?: number;
  current?: number;
  onUpgrade: () => void;
}

export function LimitReachedModal({ open, onOpenChange, variant, limit, current, onUpgrade }: LimitReachedModalProps) {
  const isTrialExpired = variant === 'trial_expired';

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
            {isTrialExpired ? 'Free Trial Ended' : 'Daily Limit Reached'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isTrialExpired
              ? 'Your 3-day free trial has ended. Upgrade to Pro to keep using DebateLab.'
              : `You've used ${current || 0} of your ${limit || 0} daily requests. Your limit resets at midnight UTC.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={onUpgrade} size="lg" className="w-full">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade to Pro — $5/mo
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-1">
            50 requests/day + advanced AI models
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
