// src/pages/SettingsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Lock, Trash2, Crown, CreditCard, Zap, Shield, Download, UserX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import { useDebateStore } from '@/lib/stores/debate-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/use-subscription';
import { redirectToPortal } from '@/lib/stripe';
import { deleteAccount, downloadAccountData } from '@/lib/account';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { formatEuropeanDate } from '@/lib/date-format';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { APP_LANGUAGES, isAppLanguage } from '@/lib/languages';


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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [accountConfirmation, setAccountConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const navigate = useNavigate();
  // Must match deletionConfirmation in supabase/functions/account/index.ts.
  const expectedAccountConfirmation = user?.email || 'DELETE';

  const adminRole = useQuery({
    queryKey: ['admin-role', user?.id],
    enabled: Boolean(user),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data?.role === 'admin';
    },
  });
  const isAdmin = Boolean(user) && adminRole.isSuccess && adminRole.data;

  const clearLocalData = () => {
    clearSession();
    resetSparringLocalData();
    useDebateStore.setState({ debates: [], currentDebateId: null, oneOff: false });
    localStorage.removeItem('debate-trainer-storage');
  };

  const handleDeleteAllData = () => {
    if (deleteEmail !== user?.email) {
      toast({ title: t('settings.deleteCancelled'), description: t('settings.deleteCancelledDesc') });
      return;
    }

    void clearAllData().then(() => {
      clearLocalData();
      setDeleteDialogOpen(false);
      setDeleteEmail('');
      toast({ title: t('settings.deleteSuccess'), description: t('settings.deleteSuccessDesc') });
    }).catch((error) => {
      console.error('Failed to delete data:', error);
      toast({ title: t('settings.deleteFailed'), description: t('settings.deleteFailedDesc'), variant: "destructive" });
    });
  };

  const handleDownloadData = async () => {
    setExporting(true);
    try {
      await downloadAccountData();
    } catch (error) {
      toast({
        title: t('settings.downloadDataFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (accountConfirmation !== expectedAccountConfirmation || deletingAccount) return;
    setDeletingAccount(true);
    try {
      await deleteAccount(accountConfirmation);
    } catch (error) {
      setDeletingAccount(false);
      toast({
        title: t('settings.deleteAccountFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      return;
    }

    clearLocalData();
    // The account is gone, so a server sign-out may fail; the local session must still end.
    await signOut().catch(() => supabase.auth.signOut({ scope: 'local' }));
    toast({ title: t('settings.deleteAccountSuccess'), description: t('settings.deleteAccountSuccessDesc') });
    navigate('/', { replace: true });
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
  const canManageStripeBilling = subscription.tier === 'pro' && subscription.hasStripeBilling;
  const upgradeLabel = subscription.tier === 'pro' ? t('settings.setUpBilling') : t('settings.upgradeToPro');

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
        </div>

        {/* Subscription Status */}
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <CardTitle>{t('settings.subscription')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.loading ? (
              <p role="status" className="text-sm text-muted-foreground">{t('settings.loading')}</p>
            ) : (
              <>
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

                <p className="text-sm text-muted-foreground">
                  {t(subscription.tier === 'expired' ? 'settings.accessExpired' : 'settings.accessActive')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Global Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('settings.globalSettings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('settings.uiLanguage')}</Label>
                <Select value={language} onValueChange={(value) => isAppLanguage(value) && setLanguage(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APP_LANGUAGES).map(([value, languageOption]) => (
                      <SelectItem key={value} value={value}>{languageOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.outputLanguage')}</Label>
                <Select value={outputLanguage} onValueChange={(value) => isAppLanguage(value) && setOutputLanguage(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APP_LANGUAGES).map(([value, languageOption]) => (
                      <SelectItem key={value} value={value}>{languageOption.label}</SelectItem>
                    ))}
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
            <div className="flex flex-col gap-3 border-t border-primary/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{t('settings.yourData')}</p>
                <p className="text-sm text-muted-foreground">{t('settings.yourDataDesc')}</p>
              </div>
              <Button variant="outline" onClick={() => void handleDownloadData()} disabled={exporting} className="shrink-0">
                <Download className="h-4 w-4 mr-2" />
                {exporting ? t('settings.downloadingData') : t('settings.downloadData')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {user && adminRole.isPending && (
          <div role="status" aria-label={t('settings.loading')} className="my-8 h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        )}
        {user && adminRole.isError && (
          <div role="alert" className="my-8 flex items-center gap-3 text-sm">
            <p>{t('settings.adminAccessFailed', 'Could not check admin access.')}</p>
            <Button variant="outline" size="sm" onClick={() => void adminRole.refetch()}>
              {t('settings.retry', 'Try again')}
            </Button>
          </div>
        )}
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
          <CardContent className="space-y-6">
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('settings.deleteAllData')}
            </Button>
            <div className="space-y-3 border-t border-destructive/20 pt-6">
              <p className="text-sm text-muted-foreground">{t('settings.deleteAccountDesc')}</p>
              <Button variant="destructive" size="sm" onClick={() => setDeleteAccountOpen(true)}>
                <UserX className="h-4 w-4 mr-2" />
                {t('settings.deleteAccount')}
              </Button>
            </div>
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
      <Dialog
        open={deleteAccountOpen}
        onOpenChange={(open) => {
          if (deletingAccount) return;
          setDeleteAccountOpen(open);
          if (!open) setAccountConfirmation('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.deleteAccountDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.deleteAccountDialogDesc', { email: user?.email || t('settings.unknownUser') })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirmation">
              {user?.email ? t('settings.typeEmailConfirm') : t('settings.typeDeleteConfirm')}
            </Label>
            <Input
              id="delete-account-confirmation"
              value={accountConfirmation}
              autoComplete="off"
              onChange={(event) => setAccountConfirmation(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleDeleteAccount(); }}
              placeholder={expectedAccountConfirmation}
              disabled={deletingAccount}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAccountOpen(false)} disabled={deletingAccount}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteAccount()}
              disabled={accountConfirmation !== expectedAccountConfirmation || deletingAccount}
            >
              {deletingAccount ? t('settings.deletingAccount') : t('settings.deleteAccount')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
