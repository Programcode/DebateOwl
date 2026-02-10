import { useState } from 'react';
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

const FREE_FEATURES = [
  '5 AI requests per day',
  'Standard AI models',
  'All debate features',
  '3-day free trial',
];

const PRO_FEATURES = [
  '50 AI requests per day',
  'Advanced models (GPT-4o, Claude 3.5 Sonnet, Gemini Pro)',
  'Deep research with Jina AI',
  'Priority processing',
  'All debate features',
];

export function PricingModal({ open, onOpenChange, onPromoRedeemed }: PricingModalProps) {
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const { toast } = useToast();

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      await redirectToCheckout(promoCode || undefined);
    } catch (err) {
      toast({
        title: 'Checkout Error',
        description: err instanceof Error ? err.message : 'Failed to start checkout',
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
        title: result.success ? 'Code Redeemed' : 'Invalid Code',
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
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to redeem code',
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
            Upgrade to Pro
          </DialogTitle>
          <DialogDescription>
            Unlock the full power of DebateLab with advanced AI models and higher limits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {/* Free Tier */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Free</h3>
              <Badge variant="secondary">Current</Badge>
            </div>
            <p className="text-2xl font-bold">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
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
                Recommended
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-1">
              <h3 className="font-semibold">Pro</h3>
            </div>
            <p className="text-2xl font-bold">$5<span className="text-sm font-normal text-muted-foreground">/mo + tax</span></p>
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
              {checkoutLoading ? 'Redirecting...' : 'Upgrade Now'}
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
              Have a promo code?
            </button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter promo code"
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
                {promoLoading ? 'Applying...' : 'Apply'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
