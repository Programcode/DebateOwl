import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, CreditCard, Sparkles, Zap, Crown } from 'lucide-react';
import { redirectToCheckout, redirectToPortal, redeemPromoCode } from '@/lib/stripe';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/use-subscription';
import { useExternalRedirectPending } from '@/hooks/use-external-redirect-pending';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { formatEuropeanDate } from '@/lib/date-format';
import {
  BILLING_ACTION_LABELS,
  PRO_MONTHLY_PRICE,
  TRIAL_DAYS,
  billingAction,
  currentPlan,
  formatPlanPrice,
  type BillingAction,
} from '@/lib/billing/plan';
import { PLAN_DIALOG_CLASS, PLAN_DIALOG_CLOSE_CLASS } from './dialog-layout';

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromoRedeemed?: () => void;
}

const TITLES: Record<BillingAction, string> = {
  upgrade: 'pricingModal.title',
  resubscribe: 'pricingModal.titleResubscribe',
  manage: 'pricingModal.titleYourPlan',
  setUpBilling: 'pricingModal.titleYourPlan',
};

/**
 * The plans and the one next step for this account (QB-16): Checkout for a
 * trial or an ended plan, the billing portal while a Stripe subscription can
 * still bill (Pro, set to cancel, or a failed payment), never Upgrade to an
 * account already on Pro.
 */
export function PricingModal({ open, onOpenChange, onPromoRedeemed }: PricingModalProps) {
  const { t, i18n } = useTranslation();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const { pending: redirecting, run: runRedirect, reset: resetRedirect } = useExternalRedirectPending();
  const [showPromo, setShowPromo] = useState(false);
  const { toast } = useToast();
  // Checkout needs the network; offline the button would only fail.
  const online = useOnlineStatus();

  // Settings keeps the modal mounted while closed, so reopening it must not
  // show a button still waiting on a checkout the user already left.
  useEffect(() => {
    if (!open) resetRedirect();
  }, [open, resetRedirect]);

  const subscription = useSubscription();
  const action = billingAction(subscription);
  const plan = currentPlan(subscription.tier);

  const FREE_FEATURES = [
    t('pricingModal.freeFeature1'),
    t('pricingModal.freeFeature2'),
    t('pricingModal.freeFeature3'),
    t('pricingModal.freeFeature4'),
  ];

  const PRO_FEATURES = [
    t('pricingModal.proFeature1'),
    t('pricingModal.proFeature2'),
    t('pricingModal.proFeature3'),
    t('pricingModal.proFeature4'),
    t('pricingModal.proFeature5'),
  ];

  const handlePlanAction = async () => {
    try {
      await runRedirect(() => action === 'manage' ? redirectToPortal() : redirectToCheckout(promoCode || undefined));
    } catch (err) {
      toast({
        title: action === 'manage' ? t('settings.portalError') : t('pricingModal.checkoutError'),
        description: err instanceof Error ? err.message : t('pricingModal.checkoutErrorDesc'),
        variant: 'destructive',
      });
    }
  };

  const subtitle = (() => {
    if (action === 'setUpBilling') return t('pricingModal.subtitleSetUpBilling');
    if (action !== 'manage') return t('pricingModal.subtitle');
    if (subscription.billingState === 'payment_failed') return t('pricingModal.subtitlePaymentFailed');
    if (subscription.billingState === 'pro_canceling' && subscription.billingDate) {
      return t('pricingModal.subtitleCanceling', { date: formatEuropeanDate(subscription.billingDate) });
    }
    return t('pricingModal.subtitleManage');
  })();

  const handlePromoRedeem = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    try {
      const result = await redeemPromoCode(promoCode.trim());
      toast({
        title: result.success ? t('pricingModal.codeRedeemed') : t('pricingModal.invalidCode'),
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        setPromoCode('');
        setShowPromo(false);
        onOpenChange(false);
        onPromoRedeemed?.();
      }
    } catch (err) {
      toast({
        title: t('pricingModal.redeemError'),
        description: err instanceof Error ? err.message : t('pricingModal.redeemErrorDesc'),
        variant: 'destructive',
      });
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${PLAN_DIALOG_CLASS} sm:max-w-[600px]`} closeClassName={PLAN_DIALOG_CLOSE_CLASS}>
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="h-5 w-5 shrink-0 text-amber-500" />
            {t(TITLES[action])}
          </DialogTitle>
          <DialogDescription>
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {/* Trial */}
          <div data-testid="plan-trial" className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('pricingModal.free')}</h3>
              {plan === 'trial' && <Badge variant="secondary">{t('pricingModal.current')}</Badge>}
            </div>
            <p className="text-2xl font-bold">
              {formatPlanPrice(0, i18n.language)}{' '}
              <span className="text-sm font-normal text-muted-foreground">{t('pricingModal.freePeriod', { count: TRIAL_DAYS })}</span>
            </p>
            <ul className="space-y-2 text-sm">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div data-testid="plan-pro" className="rounded-lg border-2 border-primary p-4 space-y-3 relative">
            {plan !== 'pro' && (
              <div className="absolute -top-3 left-4">
                <Badge className="bg-primary text-primary-foreground">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t('pricingModal.recommended')}
                </Badge>
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <h3 className="font-semibold">{t('pricingModal.pro')}</h3>
              {plan === 'pro' && <Badge variant="secondary">{t('pricingModal.current')}</Badge>}
            </div>
            <p className="text-2xl font-bold">
              {formatPlanPrice(PRO_MONTHLY_PRICE, i18n.language)}
              <span className="text-sm font-normal text-muted-foreground">{t('pricingModal.proPeriod')}</span>
            </p>
            <ul className="space-y-2 text-sm">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => void handlePlanAction()}
              disabled={redirecting || !online || subscription.loading}
              aria-describedby={online ? undefined : 'pricing-offline-upgrade'}
              variant={action === 'manage' ? 'outline' : 'default'}
              className="w-full"
              size="lg"
            >
              {action === 'manage' ? <CreditCard className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              {redirecting ? t('pricingModal.redirecting') : t(BILLING_ACTION_LABELS[action])}
            </Button>
            {!online && (
              <p id="pricing-offline-upgrade" role="status" className="text-sm text-muted-foreground">
                {t('pricingModal.offlineUpgrade')}
              </p>
            )}
          </div>
        </div>

        {/* A promo code goes with a Checkout, not with a subscription the portal manages. */}
        {action !== 'manage' && <div className="mt-2">
          {!showPromo ? (
            <button
              onClick={() => setShowPromo(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('pricingModal.promoCode')}
            </button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder={t('pricingModal.promoPlaceholder')}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handlePromoRedeem();
                }}
                className="uppercase"
              />
              <Button
                onClick={() => void handlePromoRedeem()}
                disabled={promoLoading || !promoCode.trim()}
                variant="outline"
              >
                {promoLoading ? t('pricingModal.applying') : t('pricingModal.apply')}
              </Button>
            </div>
          )}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
