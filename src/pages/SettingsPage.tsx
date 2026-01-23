// src/pages/SettingsPage.tsx
import { Settings, Cpu, Thermometer, Zap, Key, Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore, type FeatureTab } from '@/lib/stores/settings-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';
import { useState } from 'react';
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
  const { featureConfigs, setFeatureConfig, language, setLanguage, theme, setTheme, apiKeys, setApiKey, isAdmin, setAdmin, customSystemPrompt, setSystemPrompt } = useSettingsStore();
  const { clearSession } = useSessionStore();
  const { toast } = useToast();
  
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [adminCode, setAdminCode] = useState('');

  const toggleKeyVisibility = (providerId: string) => {
    setVisibleKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleAdminUnlock = () => {
    if (adminCode === 'debate2026') {
      setAdmin(true);
      toast({ title: "Admin Mode Unlocked", description: "You now have access to advanced settings." });
    } else {
      toast({ title: "Access Denied", description: "Incorrect admin code.", variant: "destructive" });
    }
  };

  const handleNuke = () => {
    if (confirm("Are you sure? This will delete ALL saved history and chats locally.")) {
      clearSession();
      // Also clear persistence if possible, but session store handles the data
      localStorage.removeItem('debate-trainer-storage'); // Hard reset
      window.location.reload();
    }
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
            Configure AI providers and models for each feature
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

        {/* API Credentials */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>API Credentials</CardTitle>
            </div>
            <CardDescription>
              Enter your API keys to enable real AI generation. Keys are stored locally in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DEFAULT_PROVIDERS.filter(p => p.requiresKey).map((provider) => (
              <div key={provider.id} className="space-y-2">
                <Label htmlFor={`key-${provider.id}`}>{provider.name} API Key</Label>
                <div className="relative">
                  <Input
                    id={`key-${provider.id}`}
                    type={visibleKeys[provider.id] ? 'text' : 'password'}
                    value={apiKeys[provider.id] || ''}
                    onChange={(e) => setApiKey(provider.id, e.target.value)}
                    placeholder={
                      isAdmin && (
                        (provider.id === 'openai' && import.meta.env.VITE_OPENAI_API_KEY) ||
                        (provider.id === 'anthropic' && import.meta.env.VITE_ANTHROPIC_API_KEY) ||
                        (provider.id === 'google' && import.meta.env.VITE_GOOGLE_API_KEY)
                      )
                        ? "System Key Active (Override with custom key)"
                        : isAdmin ? "(No system key found)" : "sk-..."
                    }
                    className="pr-10 font-mono text-sm bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(provider.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {visibleKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Per-Feature AI Settings */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">AI Provider Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure different AI providers and models for each feature. Use Mock AI for demo mode without API keys.
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

        <Separator className="my-8" />

        {/* API Key Info */}
        <Card className="border-amber-500/30 bg-amber-500/5 mb-8">
          <CardHeader>
            <CardTitle className="text-amber-600">About AI Providers</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Mock AI (Demo)</strong> — Works offline with pre-generated responses. Perfect for exploring the app without API keys.
            </p>
            <p>
              <strong>Cloud AI</strong> — Powered by Google Gemini and OpenAI models. Requires API keys.
            </p>
            <p>
              <strong>OpenAI Compatible</strong> — Connect your own OpenAI API key for full functionality.
            </p>
          </CardContent>
        </Card>

        {/* Admin Access */}
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              {isAdmin ? <Unlock className="h-5 w-5 text-destructive" /> : <Lock className="h-5 w-5 text-destructive" />}
              <CardTitle>Admin Access</CardTitle>
            </div>
            <CardDescription>Advanced controls for tournament organizers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAdmin ? (
              <div className="flex gap-2">
                <Input 
                  type="password" 
                  placeholder="Enter admin code..." 
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                />
                <Button variant="destructive" onClick={handleAdminUnlock}>Unlock</Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Global System Prompt Override</Label>
                  <Textarea 
                    placeholder="Enter a custom system prompt to override default behaviors..."
                    value={customSystemPrompt || ''}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">This prompt will be prepended to all AI requests.</p>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-destructive/20">
                  <div>
                    <h4 className="font-medium text-destructive">Danger Zone</h4>
                    <p className="text-xs text-muted-foreground">Irreversible actions</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleNuke}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Nuke Database (Reset All)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
