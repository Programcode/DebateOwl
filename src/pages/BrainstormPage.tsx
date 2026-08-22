// src/pages/BrainstormPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { BrainstormForm } from '@/components/features/brainstorm/BrainstormForm';
import { BrainstormResults } from '@/components/features/brainstorm/BrainstormResults';
import { brainstorm, askChat, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { useToast } from '@/hooks/use-toast';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import { AnimatedSection } from '@/components/ui/animated-section';

export default function BrainstormPage() {
  const { brainstormResult, brainstormLoading, setBrainstormResult, setBrainstormLoading, addAskMessage, setAskLoading, askMessages } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('brainstorm');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const { t } = useTranslation();

  const handleSubmit = async (data: BrainstormInput) => {
    setBrainstormLoading(true);
    try {
      const { result, discoveredSources } = await brainstorm(data, config);
      setDiscoveredSources(discoveredSources);
      setBrainstormResult(result);
      toast({ title: t('brainstorm.complete', 'Brainstorm complete'), description: t('brainstorm.completeDesc', 'Your argument angles are ready.'), variant: 'success' });
    } catch (error) {
      console.error('Failed to brainstorm:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({
          title: t('brainstorm.failed'),
          description: getUserFacingAIError(error),
          variant: "destructive",
        });
      }
    } finally {
      setBrainstormLoading(false);
    }
  };

  const handleDiscuss = async () => {
    if (!brainstormResult) return;

    // Construct summary based on available output
    let summary = "I'd like to discuss these brainstormed ideas.\n\n";

    if (brainstormResult.topFive) {
      summary += "**Top Ideas:**\n" + brainstormResult.topFive.map((i) => {
        const side = i.idea.side ? t(`brainstormResults.${i.idea.side}`, i.idea.side) : 'N/A';
        return `- ${i.idea.title} (${side})`;
      }).join('\n');
    } else if (brainstormResult.buckets) {
      summary += "**Key Buckets:**\n" + brainstormResult.buckets.map(b => `- ${b.name}: ${b.keyInsight}`).join('\n');
    }

    summary += "\n\nCan you help me expand on one of these?";

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
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('brainstorm.title')}</h1>
            <p className="text-muted-foreground mt-1 transition-colors duration-300">
              {t('brainstorm.subtitle')}
            </p>
          </div>
        </AnimatedSection>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <AnimatedSection delay={75} className="lg:sticky lg:top-24 lg:self-start">
            <BrainstormForm onSubmit={handleSubmit} isLoading={brainstormLoading} />
          </AnimatedSection>

          {/* Results */}
          <AnimatedSection delay={150}>
            {brainstormLoading ? (
              <div key="brainstorm-loading" className="motion-swap motion-shimmer flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-8">
                <StreamingIndicator messages={[t('brainstormForm.loadingMsg1'), t('brainstormForm.loadingMsg2'), t('brainstormForm.loadingMsg3'), t('brainstormForm.loadingMsg4'), t('brainstormForm.loadingMsg5')]} />
              </div>
            ) : brainstormResult ? (
              <div key="brainstorm-results" className="motion-swap">
                <BrainstormResults result={brainstormResult} discoveredSources={discoveredSources} onDiscuss={handleDiscuss} />
              </div>
            ) : (
              <div key="brainstorm-empty" className="motion-swap flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center">
                <div className="motion-loading-card text-6xl mb-4">💡</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('brainstorm.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('brainstorm.emptyDesc')}
                </p>
              </div>
            )}
          </AnimatedSection>
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
