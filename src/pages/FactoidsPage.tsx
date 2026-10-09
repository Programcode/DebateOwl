import { useRef, useState } from 'react';
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
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import type { FactoidsInput } from '@/lib/ai/schemas/factoids';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToolRunErrorPanel, ToolRunStatus, isCanceled, useRevealResults, useToolRun } from '@/components/features/tools/tool-run';
import { factoidsDiscussPrompt, openDiscussion } from '@/components/features/tools/discuss';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { activeDebateId } from '@/lib/stores/debate-store';
import { DebateRequiredError } from '@/lib/stores/session-store';

export default function FactoidsPage() {
  const workspace = useWorkspaceToolScope('factoids');
  const { factoidsResult, factoidsLoading, factoidsForm, setFactoidsResult, setFactoidsLoading, addSource, setFactoidsForm, recordResult } = useSessionStore(useShallow((state) => ({
    factoidsResult: state.factoidsResult,
    factoidsLoading: state.factoidsLoading,
    factoidsForm: state.factoidsForm,
    setFactoidsResult: state.setFactoidsResult,
    setFactoidsLoading: state.setFactoidsLoading,
    addSource: state.addSource,
    setFactoidsForm: state.setFactoidsForm,
    recordResult: state.recordResult,
  })));
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('factoids');
  const { toast } = useToast();
  const run = useToolRun('factoids');
  const results = useRevealResults();
  const lastInput = useRef<FactoidsInput | null>(null);
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);

  const handleSubmit = async (data: FactoidsInput) => {
    lastInput.current = data;
    const signal = run.start();
    setDiscoveredSources([]);
    setFactoidsLoading(true);
    // Factoids research a claim, not the motion, so it follows the Current Debate directly.
    const debateId = workspace.context ? null : activeDebateId();
    try {
      const { result, discoveredSources: sources } = await factoids(data, config, workspace.context ?? undefined, workspace.context ? undefined : debateId, signal);
      // A canceled request can still resolve (its last step ignores the signal); never publish it.
      if (signal.aborted) return;
      setDiscoveredSources(sources);
      setFactoidsResult(result);
      await workspace.attach(data, result);
      if (debateId) {
        await recordInDebate(() => recordResult('factoids', { title: data.claim, input: data, output: result, debateId, side: 'neutral' }));
      }
      results.reveal();
    } catch (error) {
      if (isCanceled(error, signal)) return;
      console.error('Failed to find factoids:', error);
      if (!subError.handleSubscriptionError(error)) {
        run.setError({ title: t('factoids.failed'), description: getUserFacingAIError(error) });
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

  const handleDiscuss = () => {
    if (factoidsResult) openDiscussion(navigate, factoidsDiscussPrompt(factoidsResult, t));
  };

  return (
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-6xl mx-auto">
        <PageHeader title={t('nav.factoids')} />
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
              <ToolRunStatus label={t('factoids.working', 'Searching for evidence…')} onCancel={run.cancel} />
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
              <EmptyState icon={BookOpen} title={t('factoids.emptyTitle')} description={t('factoids.emptyDesc')} />
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
