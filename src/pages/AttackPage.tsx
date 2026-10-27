// src/pages/AttackPage.tsx
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { History, Swords } from 'lucide-react';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useTranslation } from 'react-i18next';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { attackCase, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { DailyUsage, SubscriptionErrorModals } from '@/components/features/subscription';
import type { AttackInput } from '@/lib/ai/schemas/attack';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToolRunErrorPanel, isCanceled, useRevealResults, useToolRun } from '@/components/features/tools/tool-run';
import { LiveToolRun } from '@/components/features/tools/live-draft';
import { attackDraftSections } from '@/components/features/tools/live-sections';
import { attackDiscussPrompt, openDiscussion } from '@/components/features/tools/discuss';
import { prefillFromAttack } from '@/lib/crossfire/prefill';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { workspaceRouteState } from '@/lib/workspace/tool-context';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { activeDebateId } from '@/lib/stores/debate-store';

export default function AttackPage() {
  const workspace = useWorkspaceToolScope('attack');
  const { attackResult, attackLoading, attackForm, setAttackResult, setAttackLoading, recordResult } = useSessionStore(useShallow((state) => ({
    attackResult: state.attackResult,
    attackLoading: state.attackLoading,
    attackForm: state.attackForm,
    setAttackResult: state.setAttackResult,
    setAttackLoading: state.setAttackLoading,
    recordResult: state.recordResult,
  })));
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('attack');
  const run = useToolRun('attack');
  const results = useRevealResults();
  // On phones the answer sits below the form; bring it into view once the model starts writing.
  const drafting = Boolean(run.liveState.draft);
  const revealResults = results.reveal;
  useEffect(() => {
    if (drafting) revealResults();
  }, [drafting, revealResults]);
  const lastInput = useRef<AttackInput | null>(null);
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  // The text the critique on screen was written for. A critique restored with the page
  // belongs to the text restored with it.
  const critiquedText = useRef<string | null>(attackResult ? attackForm?.caseText ?? null : null);
  // The critique that a later run, for different text, failed or was refused to replace.
  const [staleCritique, setStaleCritique] = useState<object | null>(null);
  // Only that exact critique is labelled; one reopened from History is not.
  const critiqueIsStale = staleCritique !== null && staleCritique === attackResult;

  const handleSubmit = async (data: AttackInput) => {
    lastInput.current = data;
    const signal = run.start();
    setAttackLoading(true);
    // Attack critiques pasted text, not a motion, so it follows the Current Debate directly.
    const debateId = workspace.context ? null : activeDebateId();
    try {
      const { result, discoveredSources } = await attackCase(data, config, workspace.context ?? undefined, workspace.context ? undefined : debateId, signal, run.live());
      // A canceled request can still resolve (its last step ignores the signal); never publish it.
      if (signal.aborted) return;
      setDiscoveredSources(discoveredSources);
      setAttackResult(result);
      critiquedText.current = data.caseText;
      setStaleCritique(null);
      await workspace.attach(data, result);
      if (debateId) {
        const title = result.overallAssessment?.summary?.slice(0, 80) || data.caseText.slice(0, 80);
        await recordInDebate(() => recordResult('attack', { title, input: data, output: result, debateId, side: 'neutral' }));
      }
      results.reveal();
    } catch (error) {
      const shown = useSessionStore.getState().attackResult;
      setStaleCritique(shown && critiquedText.current !== null && data.caseText !== critiquedText.current ? shown : null);
      if (isCanceled(error, signal)) return;
      console.error('Failed to attack case:', error);
      if (!subError.handleSubscriptionError(error)) {
        run.setError({ title: t('attack.failed'), description: getUserFacingAIError(error) });
      }
    } finally {
      setAttackLoading(false);
    }
  };

  const handleDiscuss = () => {
    if (attackResult) openDiscussion(navigate, attackDiscussPrompt(attackResult, t));
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
        <PageHeader title={t('nav.attack')} meta={<DailyUsage />} />
        <CurrentDebateStrip hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <AttackForm onSubmit={handleSubmit} isLoading={attackLoading} debateContext={!workspace.context} />
          </div>

          {/* Results */}
          <div ref={results.ref} className="scroll-mt-24">
            {run.error && (
              <ToolRunErrorPanel
                error={run.error}
                onRetry={lastInput.current ? () => void handleSubmit(lastInput.current!) : undefined}
                onDismiss={run.clearError}
              />
            )}
            {attackLoading ? (
              <LiveToolRun label={t('attack.working', 'Reviewing your case…')} live={run.liveState} sections={run.liveState.draft ? attackDraftSections(run.liveState.draft, t) : []} onCancel={run.cancel} />
            ) : attackResult ? (
              <div key="attack-results">
                {critiqueIsStale && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm" data-testid="attack-stale-critique">
                    <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p>
                      <span className="font-medium text-foreground">{t('attack.previousCritique', 'Critique of your previous argument')}</span>
                      <span className="block text-muted-foreground">{t('attack.previousCritiqueDesc', 'Your latest version was not reviewed, so this critique may not match the text in the form.')}</span>
                    </p>
                  </div>
                )}
                <AttackResults
                  result={attackResult}
                  discoveredSources={discoveredSources}
                  onDiscuss={handleDiscuss}
                  onPracticeCrossfire={handlePracticeCrossfire}
                />
              </div>
            ) : (
              <EmptyState size="compact-below-lg" icon={Swords} title={t('attack.emptyTitle')} description={t('attack.emptyDesc')} />
            )}
          </div>
        </div>
      </div>

      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}
