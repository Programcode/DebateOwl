// src/pages/AttackPage.tsx
import { useState } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useTranslation } from 'react-i18next';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { attackCase, askChat, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { AttackInput } from '@/lib/ai/schemas/attack';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import { AnimatedSection } from '@/components/ui/animated-section';
import { prefillFromAttack } from '@/lib/crossfire/prefill';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { workspaceRouteState } from '@/lib/workspace/tool-context';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { activeDebateId } from '@/lib/stores/debate-store';

export default function AttackPage() {
  const workspace = useWorkspaceToolScope('attack');
  const { attackResult, attackLoading, attackForm, setAttackResult, setAttackLoading, addAskMessage, setAskLoading, askMessages, recordResult } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('attack'); // Actually we should use 'ask' config for the chat part
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);

  const handleSubmit = async (data: AttackInput) => {
    setAttackLoading(true);
    // Attack critiques pasted text, not a motion, so it follows the Current Debate directly.
    const debateId = workspace.context ? null : activeDebateId();
    try {
      const { result, discoveredSources } = await attackCase(data, config, workspace.context ?? undefined, workspace.context ? undefined : debateId);
      setDiscoveredSources(discoveredSources);
      setAttackResult(result);
      await workspace.attach(data, result);
      if (debateId) {
        const title = result.overallAssessment?.summary?.slice(0, 80) || data.caseText.slice(0, 80);
        await recordInDebate(() => recordResult('attack', { title, input: data, output: result, debateId, side: 'neutral' }));
      }
      toast({ title: t('attack.complete', 'Attack analysis complete'), description: t('attack.completeDesc', 'The critique is ready.'), variant: 'success' });
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
      if (!subError.handleSubscriptionError(error)) {
        toast({ title: t('chat.error'), description: t('chat.errorDesc'), variant: "destructive" });
      }
    } finally {
      setAskLoading(false);
    }
  };

  const handlePracticeCrossfire = () => {
    if (!attackResult) return;
    navigate('/app/crossfire', {
      state: {
        ...prefillFromAttack(attackForm?.caseText ?? '', attackResult),
        ...(workspace.context ? workspaceRouteState(workspace.context) : {}),
      },
    });
  };

  return (
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-6xl mx-auto">
        <AnimatedSection className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('nav.attack')}</h1>
          </div>
        </AnimatedSection>
        <CurrentDebateStrip hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <AnimatedSection delay={75} className="lg:sticky lg:top-24 lg:self-start">
            <AttackForm onSubmit={handleSubmit} isLoading={attackLoading} debateContext={!workspace.context} />
          </AnimatedSection>

          {/* Results */}
          <div>
            {attackLoading ? (
              <div key="attack-loading" className="motion-swap motion-shimmer flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 p-8">
                <StreamingIndicator messages={[t('attackForm.loadingMsg1'), t('attackForm.loadingMsg2'), t('attackForm.loadingMsg3'), t('attackForm.loadingMsg4'), t('attackForm.loadingMsg5')]} />
              </div>
            ) : attackResult ? (
              <div key="attack-results">
                <AttackResults
                  result={attackResult}
                  discoveredSources={discoveredSources}
                  onDiscuss={handleDiscuss}
                  onPracticeCrossfire={handlePracticeCrossfire}
                />
              </div>
            ) : (
              <div key="attack-empty" className="motion-swap flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 p-8 text-center">
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
