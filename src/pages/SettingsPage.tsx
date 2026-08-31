// src/pages/SettingsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Lock, Trash2, Crown, CreditCard, Zap, Shield, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/use-subscription';
import { redirectToPortal } from '@/lib/stripe';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { formatEuropeanDate } from '@/lib/date-format';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const tierLabels: Record<string, { labelKey: string; color: string }> = {
  trial: { labelKey: 'settings.tierTrial', color: 'bg-blue-500' },
  pro: { labelKey: 'settings.tierPro', color: 'bg-amber-500' },
  legacy_free: { labelKey: 'settings.tierLegacyFree', color: 'bg-green-500' },
  expired: { labelKey: 'settings.tierExpired', color: 'bg-red-500' },
};

export default function SettingsPage() {
  const { language, setLanguage, outputLanguage, setOutputLanguage, theme, setTheme } = useSettingsStore();
  const { clearSession, clearAllData } = useSessionStore();
  const resetSparringLocalData = useSparringStore((state) => state.resetLocalData);
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const subscription = useSubscription();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) setIsAdmin(false);
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin?action=stats`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!cancelled) setIsAdmin(response.ok);
    }).catch(() => {
      if (!cancelled) setIsAdmin(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleDeleteAllData = () => {
    if (deleteEmail !== user?.email) {
      toast({ title: t('settings.deleteCancelled'), description: t('settings.deleteCancelledDesc') });
      return;
    }

    void clearAllData().then(() => {
      clearSession();
      resetSparringLocalData();
      localStorage.removeItem('debate-trainer-storage');
      setDeleteDialogOpen(false);
      setDeleteEmail('');
      toast({ title: t('settings.deleteSuccess'), description: t('settings.deleteSuccessDesc') });
    }).catch((error) => {
      console.error('Failed to delete data:', error);
      toast({ title: t('settings.deleteFailed'), description: t('settings.deleteFailedDesc'), variant: "destructive" });
    });
  };

  const handleSignOut = () => {
    void signOut()
      .then(() => resetSparringLocalData())
      .catch((error) => {
        console.error('Failed to sign out:', error);
        toast({ title: t('common.error', 'Error'), description: t('settings.signOutFailed', 'Could not sign out. Please try again.'), variant: 'destructive' });
      });
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await redirectToPortal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal';
      if (message.toLowerCase().includes('no active subscription')) {
        toast({
          title: t('settings.noSubscription'),
          description: t('settings.noSubscriptionDesc'),
        });
        setPricingOpen(true);
      } else {
        toast({
          title: t('settings.portalError'),
          description: message,
          variant: 'destructive',
        });
      }
      setPortalLoading(false);
    }
  };

  const tierInfo = tierLabels[subscription.tier] || tierLabels.expired;
  const usagePercent = subscription.dailyLimit > 0 ? Math.min(100, (subscription.dailyUsed / subscription.dailyLimit) * 100) : 100;
  const canManageStripeBilling = subscription.tier === 'pro' && subscription.hasStripeBilling;
  const upgradeLabel = subscription.tier === 'pro' ? t('settings.setUpBilling') : t('settings.upgradeToPro');
  const midnightUtc = new Date();
  midnightUtc.setUTCDate(midnightUtc.getUTCDate() + 1);
  midnightUtc.setUTCHours(0, 0, 0, 0);
  const resetMs = Math.max(0, midnightUtc.getTime() - Date.now());
  const resetHours = Math.floor(resetMs / 3_600_000);
  const resetMinutes = Math.floor((resetMs % 3_600_000) / 60_000);

  return (
    <div className="container py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('settings.title')}</h1>
          </div>
          <p className="text-muted-foreground">
            {t('settings.subtitle')}
          </p>
        </div>

        {/* Subscription Status */}
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <CardTitle>{t('settings.subscription')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.subscriptionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className={`${tierInfo.color} text-white`}>{t(tierInfo.labelKey)}</Badge>
                {subscription.tier === 'trial' && subscription.trialEndsAt && (
                  <span className="text-sm text-muted-foreground">
                    {t('settings.ends')} {formatEuropeanDate(subscription.trialEndsAt)}
                  </span>
                )}
              </div>
              {canManageStripeBilling ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleManageSubscription()}
                  disabled={portalLoading}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {portalLoading ? t('settings.loading') : t('settings.manageSubscription')}
                </Button>
              ) : (
                <Button size="sm" onClick={() => setPricingOpen(true)}>
                  <Zap className="h-4 w-4 mr-2" />
                  {upgradeLabel}
                </Button>
              )}
            </div>

            {/* Usage Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('settings.dailyUsage')}</span>
                <span className="font-medium">
                  {subscription.dailyUsed} / {subscription.dailyLimit} {t('settings.requests')}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {t('settings.resetsIn', { hours: resetHours, minutes: resetMinutes })}
                      <Info className="h-3 w-3" />
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>{t('settings.usageHelp')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        {/* Global Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('settings.globalSettings')}</CardTitle>
            <CardDescription>{t('settings.globalSettingsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('settings.uiLanguage')}</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'es' | 'hu')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="hu">Magyar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.outputLanguage')}</Label>
                <Select value={outputLanguage || 'en'} onValueChange={(v) => setOutputLanguage(v as 'en' | 'es' | 'hu')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="hu">Magyar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.theme')}</Label>
                <Select value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.light')}</SelectItem>
                    <SelectItem value="dark">{t('settings.dark')}</SelectItem>
                    <SelectItem value="system">{t('settings.system')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle>{t('settings.account')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.accountDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('settings.signedInAs')}</p>
                <p className="font-medium">{user?.email || t('settings.unknownUser')}</p>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                {t('settings.signOut')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="mt-8 mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>{t('settings.admin')}</CardTitle>
              </div>
              <CardDescription>
                {t('settings.adminDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app/admin">{t('settings.openAdmin')}</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Danger Zone */}
        <Card className="border-destructive/20 bg-destructive/5 mt-8">
          <CardHeader>
            <CardTitle className="text-destructive">{t('settings.dangerZone')}</CardTitle>
            <CardDescription>
              {t('settings.dangerDesc', { email: user?.email })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('settings.deleteAllData')}
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Modals */}
      <PricingModal
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        onPromoRedeemed={() => void subscription.refresh()}
      />
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.deleteDialogDesc', { email: user?.email })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-email">{t('settings.typeEmailConfirm')}</Label>
            <Input
              id="delete-email"
              value={deleteEmail}
              onChange={(event) => setDeleteEmail(event.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && deleteEmail === user?.email) handleDeleteAllData(); }}
              placeholder={user?.email || ''}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleDeleteAllData} disabled={deleteEmail !== user?.email}>
              {t('settings.deleteAllData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
