import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import { redirectToCheckout, redeemPromoCode } from '@/lib/stripe';
import { useToast } from '@/hooks/use-toast';

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromoRedeemed?: () => void;
}

export function PricingModal({ open, onOpenChange, onPromoRedeemed }: PricingModalProps) {
  const { t } = useTranslation();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const { toast } = useToast();

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

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      await redirectToCheckout(promoCode || undefined);
    } catch (err) {
      toast({
        title: t('pricingModal.checkoutError'),
        description: err instanceof Error ? err.message : t('pricingModal.checkoutErrorDesc'),
        variant: 'destructive',
      });
      setCheckoutLoading(false);
    }
  };

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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="h-5 w-5 text-amber-500" />
            {t('pricingModal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('pricingModal.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {/* Free Tier */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('pricingModal.free')}</h3>
              <Badge variant="secondary">{t('pricingModal.current')}</Badge>
            </div>
            <p className="text-2xl font-bold">{t('pricingModal.freePrice')}<span className="text-sm font-normal text-muted-foreground">{t('pricingModal.freePeriod')}</span></p>
            <ul className="space-y-2 text-sm">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Tier */}
          <div className="rounded-lg border-2 border-primary p-4 space-y-3 relative">
            <div className="absolute -top-3 left-4">
              <Badge className="bg-primary text-primary-foreground">
                <Sparkles className="h-3 w-3 mr-1" />
                {t('pricingModal.recommended')}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-1">
              <h3 className="font-semibold">{t('pricingModal.pro')}</h3>
            </div>
            <p className="text-2xl font-bold">{t('pricingModal.proPrice')}<span className="text-sm font-normal text-muted-foreground">{t('pricingModal.proPeriod')}</span></p>
            <ul className="space-y-2 text-sm">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => void handleUpgrade()}
              disabled={checkoutLoading}
              className="w-full"
              size="lg"
            >
              <Zap className="h-4 w-4 mr-2" />
              {checkoutLoading ? t('pricingModal.redirecting') : t('pricingModal.upgradeNow')}
            </Button>
          </div>
        </div>

        {/* Promo Code Section */}
        <div className="mt-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
