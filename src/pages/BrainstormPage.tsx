// src/pages/BrainstormPage.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { BrainstormForm } from '@/components/features/brainstorm/BrainstormForm';
import { BrainstormResults } from '@/components/features/brainstorm/BrainstormResults';
import { brainstorm, askChat } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { useToast } from '@/hooks/use-toast';

export default function BrainstormPage() {
  const { brainstormResult, brainstormLoading, setBrainstormResult, setBrainstormLoading, addAskMessage, setAskLoading, askMessages } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('brainstorm');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();

  const handleSubmit = async (data: BrainstormInput) => {
    setBrainstormLoading(true);
    try {
      const result = await brainstorm(data, config);
      setBrainstormResult(result);
    } catch (error) {
      console.error('Failed to brainstorm:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({
          title: t('brainstorm.failed'),
          description: error instanceof Error ? error.message : "An unexpected error occurred",
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
      summary += "**Top Ideas:**\n" + brainstormResult.topFive.map(i => `- ${i.idea.title} (${i.idea.side?.toUpperCase() || 'N/A'})`).join('\n');
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
      toast({ title: t('chat.error'), description: t('chat.errorDesc'), variant: "destructive" });
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('brainstorm.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('brainstorm.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <BrainstormForm onSubmit={handleSubmit} isLoading={brainstormLoading} />
          </div>

          {/* Results */}
          <div>
            {brainstormResult ? (
              <BrainstormResults result={brainstormResult} onDiscuss={handleDiscuss} />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center">
                <div className="text-6xl mb-4">💡</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('brainstorm.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('brainstorm.emptyDesc')}
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
