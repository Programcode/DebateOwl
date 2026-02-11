// src/pages/SettingsPage.tsx
import { useState } from 'react';
import { Settings, Cpu, Thermometer, Zap, Lock, Trash2, Crown, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
import { useSettingsStore, type FeatureTab } from '@/lib/stores/settings-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/use-subscription';
import { redirectToPortal } from '@/lib/stripe';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { ModelRestrictedModal } from '@/components/features/subscription/ModelRestrictedModal';

const featureLabels: Record<FeatureTab, { name: string; description: string; color: string }> = {
  generate: { name: 'Generate', description: 'Argument generation', color: 'bg-primary' },
  attack: { name: 'Attack', description: 'Case analysis', color: 'bg-destructive' },
  brainstorm: { name: 'Brainstorm', description: 'Idea exploration', color: 'bg-amber-500' },
  factoids: { name: 'Factoids', description: 'Evidence finding', color: 'bg-secondary' },
  ask: { name: 'Ask', description: 'Q&A coaching', color: 'bg-primary' },
};

const features: FeatureTab[] = ['generate', 'attack', 'brainstorm', 'factoids', 'ask'];

const tierLabels: Record<string, { label: string; color: string }> = {
  trial: { label: 'Free Trial', color: 'bg-blue-500' },
  pro: { label: 'Pro', color: 'bg-amber-500' },
  legacy_free: { label: 'Legacy Free', color: 'bg-green-500' },
  expired: { label: 'Expired', color: 'bg-red-500' },
};

export default function SettingsPage() {
  const { featureConfigs, setFeatureConfig, language, setLanguage, theme, setTheme } = useSettingsStore();
  const { clearSession, clearAllData } = useSessionStore();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const subscription = useSubscription();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [modelRestrictionOpen, setModelRestrictionOpen] = useState(false);
  const [restrictedModelName, setRestrictedModelName] = useState<string>();
  const [portalLoading, setPortalLoading] = useState(false);

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

  const handleModelSelect = (feature: FeatureTab, modelId: string) => {
    // Check if model is pro-only and user isn't pro
    const provider = DEFAULT_PROVIDERS.find(p => p.id === featureConfigs[feature].provider);
    const model = provider?.models.find(m => m.id === modelId);
    if (model?.isProOnly && !subscription.isPro) {
      setRestrictedModelName(model.name);
      setModelRestrictionOpen(true);
      return;
    }
    setFeatureConfig(feature, { model: modelId });
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
                    Ends {new Date(subscription.trialEndsAt).toLocaleDateString()}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>AI Output Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'es')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
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

        {/* Per-Feature AI Settings */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">AI Provider Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure different AI providers and models for each feature. Keys are managed server-side.
          </p>

          <div className="grid gap-4">
            {features.map((feature) => {
              const featureInfo = featureLabels[feature];
              const config = featureConfigs[feature];
              const selectedProvider = DEFAULT_PROVIDERS.find(p => p.id === config.provider);

              return (
                <Card key={feature}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${featureInfo.color}`} />
                      <div>
                        <CardTitle className="text-base">{featureInfo.name}</CardTitle>
                        <CardDescription>{featureInfo.description}</CardDescription>
                      </div>
                      {config.provider === 'mock' && (
                        <Badge variant="outline" className="ml-auto">Demo Mode</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {/* Provider */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Cpu className="h-4 w-4" />
                          Provider
                        </Label>
                        <Select
                          value={config.provider}
                          onValueChange={(v) => setFeatureConfig(feature, { provider: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEFAULT_PROVIDERS.map((provider) => (
                              <SelectItem
                                key={provider.id}
                                value={provider.id}
                                disabled={!provider.isAvailable()}
                              >
                                <div className="flex items-center gap-2">
                                  {provider.name}
                                  {!provider.isAvailable() && (
                                    <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Model */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Model
                        </Label>
                        <Select
                          value={config.model}
                          onValueChange={(v) => handleModelSelect(feature, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProvider?.models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center gap-2">
                                  <div>
                                    <div>{model.name}</div>
                                    <div className="text-xs text-muted-foreground">{model.description}</div>
                                  </div>
                                  {model.isProOnly && !subscription.isPro && (
                                    <Badge variant="outline" className="text-[10px] shrink-0">Pro</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Temperature */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="h-4 w-4" />
                          Temperature: {config.temperature.toFixed(1)}
                        </Label>
                        <Slider
                          value={[config.temperature]}
                          onValueChange={([v]) => setFeatureConfig(feature, { temperature: v })}
                          min={0}
                          max={1}
                          step={0.1}
                          className="mt-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Precise</span>
                          <span>Creative</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>


        {/* Danger Zone */}
        <Card className="border-destructive/20 bg-destructive/5">
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
      <ModelRestrictedModal
        open={modelRestrictionOpen}
        onOpenChange={setModelRestrictionOpen}
        modelName={restrictedModelName}
        onUpgrade={() => {
          setModelRestrictionOpen(false);
          setPricingOpen(true);
        }}
      />
    </div>
  );
}
