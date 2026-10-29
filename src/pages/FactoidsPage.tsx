import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { FactoidsForm } from '@/components/features/factoids/FactoidsForm';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import { factoids, type DiscoveredSource } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { DailyUsage, SubscriptionErrorModals } from '@/components/features/subscription';
import type { FactoidsInput } from '@/lib/ai/schemas/factoids';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToolRunErrorPanel, isCanceled, toolRunError, useRevealResults, useToolRun } from '@/components/features/tools/tool-run';
import { LiveToolRun } from '@/components/features/tools/live-draft';
import { factoidsDraftSections } from '@/components/features/tools/live-sections';
import { factoidsDiscussPrompt, openDiscussion } from '@/components/features/tools/discuss';
import { markResultSaved, useResultSaved } from '@/components/features/tools/result-actions';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { activeDebateId } from '@/lib/stores/debate-store';
import { DebateRequiredError } from '@/lib/stores/session-store';

export default function FactoidsPage() {
  const workspace = useWorkspaceToolScope('factoids');
  const { factoidsResult, factoidsLoading, factoidsForm, setFactoidsResult, setFactoidsLoading, addSource, setFactoidsForm, recordResult, saveCurrentFactoids } = useSessionStore(useShallow((state) => ({
    factoidsResult: state.factoidsResult,
    factoidsLoading: state.factoidsLoading,
    factoidsForm: state.factoidsForm,
    setFactoidsResult: state.setFactoidsResult,
    setFactoidsLoading: state.setFactoidsLoading,
    addSource: state.addSource,
    setFactoidsForm: state.setFactoidsForm,
    recordResult: state.recordResult,
    saveCurrentFactoids: state.saveCurrentFactoids,
  })));
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('factoids');
  const { toast } = useToast();
  const run = useToolRun('factoids');
  const results = useRevealResults();
  // On phones the answer sits below the form; bring it into view once the model starts writing.
  const drafting = Boolean(run.liveState.draft);
  const revealResults = results.reveal;
  useEffect(() => {
    if (drafting) revealResults();
  }, [drafting, revealResults]);
  const lastInput = useRef<FactoidsInput | null>(null);
  const navigate = useNavigate();
  const subError = useSubscriptionError('factoids');
  const { t } = useTranslation();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const resultSaved = useResultSaved(factoidsResult);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: FactoidsInput) => {
    lastInput.current = data;
    const signal = run.start();
    setDiscoveredSources([]);
    setFactoidsLoading(true);
    // Factoids research a claim, not the motion, so it follows the Current Debate directly.
    const debateId = workspace.context ? null : activeDebateId();
    try {
      const { result, discoveredSources: sources } = await factoids(data, config, workspace.context ?? undefined, workspace.context ? undefined : debateId, signal, run.live());
      // A canceled request can still resolve (its last step ignores the signal); never publish it.
      if (signal.aborted) return;
      setDiscoveredSources(sources);
      setFactoidsResult(result);
      await workspace.attach(data, result);
      if (debateId) {
        if (await recordInDebate(() => recordResult('factoids', { title: data.claim, input: data, output: result, debateId, side: 'neutral' }))) markResultSaved(result);
      }
      results.reveal();
    } catch (error) {
      if (isCanceled(error, signal)) return;
      console.error('Failed to find factoids:', error);
      if (!subError.handleSubscriptionError(error)) {
        run.setError(toolRunError(t('factoids.failed'), error));
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
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof DebateRequiredError ? t('debate.sourceNeedsDebate', 'Start or select a debate before saving sources.') : t('factoids.saveFailed', 'Could not save source.'),
        variant: 'destructive',
      });
    }
  };

  // Results outside a debate are not saved automatically; Save puts them in History.
  const handleSave = async () => {
    const result = factoidsResult;
    if (!result || saving) return;
    setSaving(true);
    try {
      await saveCurrentFactoids((lastInput.current?.claim || factoidsForm?.claim || t('generatedArtifacts.factoidsTitle')).slice(0, 300));
      markResultSaved(result);
      toast({ title: t('resultActions.savedToHistory', 'Saved to history') });
    } catch (error) {
      console.error('Failed to save factoids:', error);
      toast({ title: t('resultActions.saveFailed', 'Could not save. Try again.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscuss = () => {
    if (factoidsResult) openDiscussion(navigate, factoidsDiscussPrompt(factoidsResult, t));
  };

  return (
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-6xl mx-auto">
        <PageHeader title={t('nav.factoids')} meta={<DailyUsage />} />
        <CurrentDebateStrip hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <FactoidsForm onSubmit={handleSubmit} isLoading={factoidsLoading} debateContext={!workspace.context} />
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
            {factoidsLoading ? (
              <LiveToolRun label={t('factoids.working', 'Searching for evidence…')} live={run.liveState} sections={run.liveState.draft ? factoidsDraftSections(run.liveState.draft, t) : []} onCancel={run.cancel} />
            ) : factoidsResult ? (
              <div key="factoids-results">
                <FactoidsResults
                  result={factoidsResult}
                  discoveredSources={discoveredSources}
                  onDiscuss={handleDiscuss}
                  onSave={() => void handleSave()}
                  saved={resultSaved}
                  saving={saving}
                  onSaveSource={handleSaveToLibrary}
                  onUseSuggestion={handleUseSuggestion}
                />
              </div>
            ) : (
              <EmptyState size="compact-below-lg" icon={BookOpen} title={t('factoids.emptyTitle')} description={t('factoids.emptyDesc')} />
            )}
          </div>
        </div>
      </div>

      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}
