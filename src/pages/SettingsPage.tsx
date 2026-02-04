// src/pages/SettingsPage.tsx
import { Settings, Cpu, Thermometer, Zap, Lock, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
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

const featureLabels: Record<FeatureTab, { name: string; description: string; color: string }> = {
  generate: { name: 'Generate', description: 'Argument generation', color: 'bg-primary' },
  attack: { name: 'Attack', description: 'Case analysis', color: 'bg-destructive' },
  brainstorm: { name: 'Brainstorm', description: 'Idea exploration', color: 'bg-amber-500' },
  factoids: { name: 'Factoids', description: 'Evidence finding', color: 'bg-secondary' },
  ask: { name: 'Ask', description: 'Q&A coaching', color: 'bg-primary' },
};

const features: FeatureTab[] = ['generate', 'attack', 'brainstorm', 'factoids', 'ask'];

export default function SettingsPage() {
  const { featureConfigs, setFeatureConfig, language, setLanguage, theme, setTheme } = useSettingsStore();
  const { clearSession, clearAllData } = useSessionStore();
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleDeleteAllData = () => {
    // First confirmation
    if (!confirm(`Are you sure you want to delete ALL your saved data?\n\nThis will permanently delete all cases, attacks, brainstorms, factoids, chats, and sources for ${user?.email}.\n\nThis action cannot be undone.`)) {
      return;
    }

    // Second confirmation - require typing email
    const typedEmail = prompt(`To confirm deletion, please type your email address:\n${user?.email}`);
    if (typedEmail !== user?.email) {
      toast({ title: "Cancelled", description: "Email didn't match. No data was deleted." });
      return;
    }

    // Perform deletion
    void clearAllData().then(() => {
      clearSession();
      localStorage.removeItem('debate-trainer-storage');
      toast({ title: "Data Deleted", description: "All your saved data has been permanently removed." });
    }).catch((error) => {
      console.error('Failed to delete data:', error);
      toast({ title: "Error", description: "Failed to delete data. Please try again.", variant: "destructive" });
    });
  };

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

        {/* Global Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Global Settings</CardTitle>
            <CardDescription>App-wide preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
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
                          onValueChange={(v) => setFeatureConfig(feature, { model: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProvider?.models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div>
                                  <div>{model.name}</div>
                                  <div className="text-xs text-muted-foreground">{model.description}</div>
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
    </div>
  );
}
