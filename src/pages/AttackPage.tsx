// src/pages/AttackPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useTranslation } from 'react-i18next';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { attackCase, askChat } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { AttackInput } from '@/lib/ai/schemas/attack';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { ModelSelector } from '@/components/ModelSelector';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';

export default function AttackPage() {
  const { attackResult, attackLoading, setAttackResult, setAttackLoading, addAskMessage, setAskLoading, askMessages } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('attack'); // Actually we should use 'ask' config for the chat part
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();

  const handleSubmit = async (data: AttackInput) => {
    setAttackLoading(true);
    try {
      const result = await attackCase(data, config);
      setAttackResult(result);
    } catch (error) {
      console.error('Failed to attack case:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({
          title: t('attack.failed'),
          description: getUserFacingAIError(error),
          variant: "destructive",
        });
      }
    } finally {
      setAttackLoading(false);
    }
  };

  const handleDiscuss = async () => {
    if (!attackResult) return;

    const summary = `I'd like to discuss the critique of my case.
    
    **Overall Assessment:** ${attackResult.overallAssessment.summary}
    **Score:** ${attackResult.overallAssessment.score}/100
    
    **Top Weaknesses:**
    ${attackResult.weaknesses.slice(0, 3).map(w => `- ${w.description} (${w.severity})`).join('\n')}
    
    Can you help me improve this?`;

    // 1. Add User Message
    addAskMessage({ role: 'user', content: summary });

    // 2. Navigate immediately so user sees the chat
    navigate('/app/ask');

    // 3. Trigger AI (This runs in background even after nav)
    setAskLoading(true);
    try {
      // Construct history including the new message
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
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('attack.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('attack.subtitle')}
            </p>
          </div>
          <ModelSelector feature="attack" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <AttackForm onSubmit={handleSubmit} isLoading={attackLoading} />
          </div>

          {/* Results */}
          <div>
            {attackLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 p-8">
                <StreamingIndicator messages={['Analyzing argument...', 'Finding weaknesses...', 'Preparing critique...', 'Finalizing...']} />
              </div>
            ) : attackResult ? (
              <AttackResults result={attackResult} onDiscuss={handleDiscuss} />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 p-8 text-center">
                <div className="text-6xl mb-4">⚔️</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('attack.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('attack.emptyDesc')}
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
