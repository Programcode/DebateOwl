import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { FactoidsForm } from '@/components/features/factoids/FactoidsForm';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import { factoids, askChat, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { FactoidsInput } from '@/lib/ai/schemas/factoids';
import { useToast } from '@/hooks/use-toast';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import { AnimatedSection } from '@/components/ui/animated-section';

export default function FactoidsPage() {
  const { factoidsResult, factoidsLoading, factoidsForm, setFactoidsResult, setFactoidsLoading, addAskMessage, setAskLoading, askMessages, addSource, setFactoidsForm } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('factoids');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);

  const handleSubmit = async (data: FactoidsInput) => {
    setDiscoveredSources([]);
    setFactoidsLoading(true);
    try {
      const { result, discoveredSources: sources } = await factoids(data, config);
      setDiscoveredSources(sources);
      setFactoidsResult(result);
      toast({ title: t('factoids.complete', 'Research complete'), description: t('factoids.completeDesc', 'Verified evidence is ready.'), variant: 'success' });
    } catch (error) {
      console.error('Failed to find factoids:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({
          title: t('factoids.failed'),
          description: getUserFacingAIError(error),
          variant: "destructive",
        });
      }
    } finally {
      setFactoidsLoading(false);
    }
  };

  const handleUseSuggestion = (query: string) => {
    const nextInput: FactoidsInput = {
      claim: query,
      direction: factoidsForm.direction || 'for',
      region: factoidsForm.region || '',
      sourceType: factoidsForm.sourceType || 'any',
      timeframe: factoidsForm.timeframe || '',
      sourceCount: factoidsForm.sourceCount || 5,
    };
    setFactoidsForm(nextInput);
    void handleSubmit(nextInput);
  };

  const handleSaveToLibrary = async (title: string, content: string, url?: string) => {
    try {
      await addSource({ title, content, type: 'url', origin: url, folder: 'Factoids' });
      toast({ title: t('factoids.savedToLibrary'), description: t('factoids.savedToLibraryDesc') });
    } catch {
      toast({ title: t('common.error', 'Error'), description: t('factoids.saveFailed', 'Could not save source.'), variant: 'destructive' });
    }
  };

  const handleDiscuss = async () => {
    if (!factoidsResult) return;

    const summary = `I'd like to discuss the evidence I found.
    
    **Factoids:**
    ${factoidsResult.factoids.slice(0, 3).map(f => `- ${f.shortClaim} (${f.citation.publisher})`).join('\n')}
    
    How can I best use this evidence?`;

    addAskMessage({ role: 'user', content: summary });
    navigate('/app/ask');

    setAskLoading(true);
    try {
      const history = [...askMessages, { role: 'user', content: summary }].map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      const result = await askChat(summary, history, 'general', askConfig);

      addAskMessage({
        role: 'assistant',
        content: result.response,
        output: result
      });
    } catch (error) {
      console.error('Failed to discuss result:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({ title: t('chat.error'), description: t('chat.errorDesc'), variant: "destructive" });
      }
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <AnimatedSection className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('nav.factoids')}</h1>
          </div>
        </AnimatedSection>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <AnimatedSection delay={75} className="lg:sticky lg:top-24 lg:self-start">
            <FactoidsForm onSubmit={handleSubmit} isLoading={factoidsLoading} />
          </AnimatedSection>

          {/* Results */}
          <div>
            {factoidsLoading ? (
              <div key="factoids-loading" className="motion-swap motion-shimmer flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-secondary/30 bg-secondary/5 p-8">
                <StreamingIndicator messages={[t('factoidsForm.loadingMsg1'), t('factoidsForm.loadingMsg2'), t('factoidsForm.loadingMsg3'), t('factoidsForm.loadingMsg4'), t('factoidsForm.loadingMsg5')]} />
              </div>
            ) : factoidsResult ? (
              <div key="factoids-results">
                <FactoidsResults
                  result={factoidsResult}
                  discoveredSources={discoveredSources}
                  onDiscuss={handleDiscuss}
                  onSaveSource={handleSaveToLibrary}
                  onUseSuggestion={handleUseSuggestion}
                />
              </div>
            ) : (
              <div key="factoids-empty" className="motion-swap flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-secondary/30 bg-secondary/5 p-8 text-center">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('factoids.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('factoids.emptyDesc')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <LimitReachedModal
        open={subError.limitModalOpen}
        onOpenChange={subError.setLimitModalOpen}
        variant={subError.limitModalVariant}
        limit={subError.limitModalLimit}
        current={subError.limitModalCurrent}
        onUpgrade={() => { subError.setLimitModalOpen(false); subError.setPricingModalOpen(true); }}
      />
      <ModelRestrictedModal
        open={subError.modelModalOpen}
        onOpenChange={subError.setModelModalOpen}
        onUpgrade={() => {
          subError.setModelModalOpen(false);
          subError.setPricingModalOpen(true);
        }}
      />
      <PricingModal
        open={subError.pricingModalOpen}
        onOpenChange={subError.setPricingModalOpen}
      />
    </div>
  );
}
