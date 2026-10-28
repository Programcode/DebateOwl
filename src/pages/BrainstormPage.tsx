// src/pages/BrainstormPage.tsx
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { BrainstormForm } from '@/components/features/brainstorm/BrainstormForm';
import { BrainstormResults } from '@/components/features/brainstorm/BrainstormResults';
import { brainstorm, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { DailyUsage, SubscriptionErrorModals } from '@/components/features/subscription';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToolRunErrorPanel, isCanceled, useRevealResults, useToolRun } from '@/components/features/tools/tool-run';
import { LiveToolRun } from '@/components/features/tools/live-draft';
import { brainstormDraftSections } from '@/components/features/tools/live-sections';
import { brainstormDiscussPrompt, openDiscussion } from '@/components/features/tools/discuss';
import { markResultSaved, useResultSaved } from '@/components/features/tools/result-actions';
import { useToast } from '@/hooks/use-toast';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateMotionGate } from '@/components/features/debate/DebateMotionGate';

export default function BrainstormPage() {
  const workspace = useWorkspaceToolScope('brainstorm');
  const { brainstormResult, brainstormLoading, brainstormForm, setBrainstormResult, setBrainstormLoading, recordResult, saveCurrentBrainstorm } = useSessionStore(useShallow((state) => ({
    brainstormResult: state.brainstormResult,
    brainstormLoading: state.brainstormLoading,
    brainstormForm: state.brainstormForm,
    setBrainstormResult: state.setBrainstormResult,
    setBrainstormLoading: state.setBrainstormLoading,
    recordResult: state.recordResult,
    saveCurrentBrainstorm: state.saveCurrentBrainstorm,
  })));
  const debateGate = useDebateMotionGate({ disabled: Boolean(workspace.context) });
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('brainstorm');
  const run = useToolRun('brainstorm');
  const results = useRevealResults();
  // On phones the answer sits below the form; bring it into view once the model starts writing.
  const drafting = Boolean(run.liveState.draft);
  const revealResults = results.reveal;
  useEffect(() => {
    if (drafting) revealResults();
  }, [drafting, revealResults]);
  const lastRun = useRef<{ data: BrainstormInput; debateId: string | null } | null>(null);
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const resultSaved = useResultSaved(brainstormResult);
  const [saving, setSaving] = useState(false);

  const handleSubmit = (data: BrainstormInput) => debateGate.run(data.motion, (target) => void submitBrainstorm(data, target.debateId));

  const submitBrainstorm = async (data: BrainstormInput, debateId: string | null) => {
    const target = { debateId };
    lastRun.current = { data, debateId };
    const signal = run.start();
    setBrainstormLoading(true);
    try {
      const { result, discoveredSources } = await brainstorm(data, config, workspace.context ?? undefined, workspace.context ? undefined : target.debateId, signal, run.live());
      // A canceled request can still resolve (its last step ignores the signal); never publish it.
      if (signal.aborted) return;
      setDiscoveredSources(discoveredSources);
      setBrainstormResult(result);
      await workspace.attach(data, result);
      if (target.debateId) {
        if (await recordInDebate(() => recordResult('brainstorm', { title: data.motion, input: data, output: result, debateId: target.debateId, side: data.side }))) markResultSaved(result);
      }
      results.reveal();
    } catch (error) {
      if (isCanceled(error, signal)) return;
      console.error('Failed to brainstorm:', error);
      if (!subError.handleSubscriptionError(error)) {
        run.setError({ title: t('brainstorm.failed'), description: getUserFacingAIError(error) });
      }
    } finally {
      setBrainstormLoading(false);
    }
  };

  // One-off results are not saved automatically; Save puts them in History.
  const handleSave = async () => {
    const result = brainstormResult;
    if (!result || saving) return;
    setSaving(true);
    try {
      await saveCurrentBrainstorm((lastRun.current?.data.motion || brainstormForm?.motion || t('generatedArtifacts.brainstormTitle')).slice(0, 300));
      markResultSaved(result);
      toast({ title: t('resultActions.savedToHistory', 'Saved to history') });
    } catch (error) {
      console.error('Failed to save brainstorm:', error);
      toast({ title: t('resultActions.saveFailed', 'Could not save. Try again.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscuss = () => {
    if (brainstormResult) openDiscussion(navigate, brainstormDiscussPrompt(brainstormResult, t));
  };

  return (
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-6xl mx-auto">
        <PageHeader title={t('nav.brainstorm')} meta={<DailyUsage />} />
        <CurrentDebateStrip side={brainstormForm?.side} hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <BrainstormForm onSubmit={handleSubmit} isLoading={brainstormLoading} debatePrefill={!workspace.context} />
          </div>

          {/* Results */}
          <div ref={results.ref} className="scroll-mt-24">
            {run.error && (
              <ToolRunErrorPanel
                error={run.error}
                onRetry={lastRun.current ? () => void submitBrainstorm(lastRun.current!.data, lastRun.current!.debateId) : undefined}
                onDismiss={run.clearError}
              />
            )}
            {brainstormLoading ? (
              <LiveToolRun label={t('brainstorm.working', 'Finding angles…')} live={run.liveState} sections={run.liveState.draft ? brainstormDraftSections(run.liveState.draft, t) : []} onCancel={run.cancel} />
            ) : brainstormResult ? (
              <div key="brainstorm-results">
                <BrainstormResults result={brainstormResult} discoveredSources={discoveredSources} onDiscuss={handleDiscuss} onSave={() => void handleSave()} saved={resultSaved} saving={saving} />
              </div>
            ) : (
              <EmptyState size="compact-below-lg" icon={Lightbulb} title={t('brainstorm.emptyTitle')} description={t('brainstorm.emptyDesc')} />
            )}
          </div>
        </div>
      </div>

      {debateGate.dialog}
      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}
