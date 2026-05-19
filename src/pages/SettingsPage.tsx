// src/pages/SettingsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Lock, Trash2, Crown, CreditCard, Zap, Shield } from 'lucide-react';
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
import { useAuth } from '@/lib/supabase/AuthProvider';
import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/use-subscription';
import { redirectToPortal } from '@/lib/stripe';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { formatEuropeanDate } from '@/lib/date-format';


const tierLabels: Record<string, { label: string; color: string }> = {
  trial: { label: 'Free Trial', color: 'bg-blue-500' },
  pro: { label: 'Pro', color: 'bg-amber-500' },
  legacy_free: { label: 'Legacy Free', color: 'bg-green-500' },
  expired: { label: 'Expired', color: 'bg-red-500' },
};

export default function SettingsPage() {
  const { language, setLanguage, outputLanguage, setOutputLanguage, theme, setTheme } = useSettingsStore();
  const { clearSession, clearAllData } = useSessionStore();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const subscription = useSubscription();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
    if (!confirm(`Are you sure you want to delete ALL your saved data?\n\nThis will permanently delete all cases, attacks, brainstorms, factoids, chats, and sources for ${user?.email}.\n\nThis action cannot be undone.`)) {
      return;
    }

    const typedEmail = prompt(`To confirm deletion, please type your email address:\n${user?.email}`);
    if (typedEmail !== user?.email) {
      toast({ title: "Cancelled", description: "Email didn't match. No data was deleted." });
      return;
    }

    void clearAllData().then(() => {
      clearSession();
      localStorage.removeItem('debate-trainer-storage');
      toast({ title: "Data Deleted", description: "All your saved data has been permanently removed." });
    }).catch((error) => {
      console.error('Failed to delete data:', error);
      toast({ title: "Error", description: "Failed to delete data. Please try again.", variant: "destructive" });
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
          title: 'No Subscription Found',
          description: 'This account is not connected to Stripe billing. Upgrade to Pro to start a subscription.',
        });
        setPricingOpen(true);
      } else {
        toast({
          title: 'Error',
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
  const upgradeLabel = subscription.tier === 'pro' ? 'Set Up Billing' : 'Upgrade to Pro';

  return (
    <div className="container py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure your account and AI preferences
          </p>
        </div>

        {/* Subscription Status */}
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <CardTitle>Subscription</CardTitle>
            </div>
            <CardDescription>
              Your current plan and usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className={`${tierInfo.color} text-white`}>{tierInfo.label}</Badge>
                {subscription.tier === 'trial' && subscription.trialEndsAt && (
                  <span className="text-sm text-muted-foreground">
                    Ends {formatEuropeanDate(subscription.trialEndsAt)}
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
                  {portalLoading ? 'Loading...' : 'Manage Subscription'}
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
                <span className="text-muted-foreground">Daily Usage</span>
                <span className="font-medium">
                  {subscription.dailyUsed} / {subscription.dailyLimit} requests
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Resets at midnight UTC
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Global Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Global Settings</CardTitle>
            <CardDescription>App-wide preferences</CardDescription>
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
              <CardTitle>Account</CardTitle>
            </div>
            <CardDescription>
              Signed in with Google. API keys are managed securely on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Signed in as</p>
                <p className="font-medium">{user?.email || 'Unknown user'}</p>
              </div>
              <Button variant="outline" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Model Info */}
        <Card>
          <CardHeader>
            <CardTitle>AI Models</CardTitle>
            <CardDescription>
              Select your preferred model directly from each feature page using the model dropdown in the header.
            </CardDescription>
          </CardHeader>
        </Card>

        {isAdmin && (
          <Card className="mt-8 mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Admin</CardTitle>
              </div>
              <CardDescription>
                Open the admin dashboard for usage, users, limits, and promo codes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app/admin">Open Admin Panel</Link>
              </Button>
            </CardContent>
          </Card>
        )}


        {/* Danger Zone */}
        <Card className="border-destructive/20 bg-destructive/5 mt-8">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete all your saved data. This only affects your account ({user?.email}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={handleDeleteAllData}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All My Data
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
    </div>
  );
}
