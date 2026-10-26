// src/pages/GeneratePage.tsx
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { generateCase, isAIAuthError, isAIRateLimitError, isTimeoutError, type DiscoveredSource } from '@/lib/ai/client';
import type { GenerateInput } from '@/lib/ai/schemas/generate';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { DailyUsage, SubscriptionErrorModals } from '@/components/features/subscription';
import { caseHasFlowchart, flowchartFromCase } from '@/lib/flowchart';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Save, Target } from 'lucide-react';
import { Owl } from '@/components/brand/Owl';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToolRunErrorPanel, isCanceled, useRevealResults, useToolRun } from '@/components/features/tools/tool-run';
import { LiveToolRun } from '@/components/features/tools/live-draft';
import { generateDraftSections } from '@/components/features/tools/live-sections';
import { generateDiscussPrompt, openDiscussion } from '@/components/features/tools/discuss';
import { markResultSaved, useResultSaved } from '@/components/features/tools/result-actions';
import { prefillFromGenerate } from '@/lib/crossfire/prefill';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { workspaceRouteState } from '@/lib/workspace/tool-context';
import { activeDebateId, sameMotion, selectCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { recordInDebate } from '@/lib/debate/record';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateMotionGate } from '@/components/features/debate/DebateMotionGate';

export default function GeneratePage() {
  const workspace = useWorkspaceToolScope('generate');
  const { generateResult, generateLoading, generateRegeneratingSection: regeneratingSection, generateForm, generateResultDebateId, setGenerateResult, setGenerateLoading, setGenerateRegeneratingSection, setGenerateResultDebateId, saveCurrentCase, setPendingFlowchartData, autosavedCases, recordResult, updateRecordedResult } = useSessionStore(useShallow((state) => ({
    generateResult: state.generateResult,
    generateLoading: state.generateLoading,
    generateRegeneratingSection: state.generateRegeneratingSection,
    generateForm: state.generateForm,
    generateResultDebateId: state.generateResultDebateId,
    setGenerateResult: state.setGenerateResult,
    setGenerateLoading: state.setGenerateLoading,
    setGenerateRegeneratingSection: state.setGenerateRegeneratingSection,
    setGenerateResultDebateId: state.setGenerateResultDebateId,
    saveCurrentCase: state.saveCurrentCase,
    setPendingFlowchartData: state.setPendingFlowchartData,
    autosavedCases: state.autosavedCases,
    recordResult: state.recordResult,
    updateRecordedResult: state.updateRecordedResult,
  })));
  const debateGate = useDebateMotionGate({ disabled: Boolean(workspace.context) });
  // The debate row this page's current result was recorded into, if any.
  const [recordedCaseId, setRecordedCaseId] = useState<string | null>(null);
  // Undo shows an autosaved snapshot, which is not the recorded case.
  const [restoredSnapshot, setRestoredSnapshot] = useState(false);
  // Debate the current result belongs to (null for one-off); undefined after a reload.
  const [resultDebateId, setResultDebateId] = useState<string | null | undefined>(undefined);
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('generate');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const run = useToolRun('generate');
  const results = useRevealResults();
  // On phones the answer sits below the form; bring it into view once the model starts writing.
  const drafting = Boolean(run.liveState.draft);
  const revealResults = results.reveal;
  useEffect(() => {
    if (drafting) revealResults();
  }, [drafting, revealResults]);
  const lastRun = useRef<{ data: GenerateInput; debateId: string | null } | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const resultSaved = useResultSaved(generateResult);

  const handleUndo = () => {
    const prev = (autosavedCases || []).find(item => item.data !== generateResult);
    if (prev) {
      setGenerateResult(prev.data);
      // A snapshot does not record its debate or its saved row. Unknown keeps it out of
      // the Flowchart, and a regeneration then cannot overwrite the replaced case's row.
      useSessionStore.setState({ generateResultDebateId: undefined });
      setResultDebateId(undefined);
      setRestoredSnapshot(true);
      // Autosaved snapshots do not carry researched sources; drop the panel
      // rather than showing provenance that belongs to a different case.
      setDiscoveredSources([]);
      toast({ title: t('generate.undone', 'Reverted'), description: t('generate.undoneDesc', 'Loaded previous generation.') });
    } else {
      toast({ title: t('generate.noUndo', 'Nothing to undo'), variant: 'destructive' });
    }
  };

  const handleSubmit = (data: GenerateInput) => debateGate.run(data.motion, (target) => void submitGenerate(data, target.debateId));

  const submitGenerate = async (data: GenerateInput, debateId: string | null) => {
    const target = { debateId };
    lastRun.current = { data, debateId };
    const signal = run.start();
    setGenerateLoading(true);
    try {
      const { result, discoveredSources: sources } = await generateCase(data, config, workspace.context ?? undefined, workspace.context ? undefined : target.debateId, signal, run.live());
      // A canceled request can still resolve (its last step ignores the signal); never publish it.
      if (signal.aborted) return;
      // Always stamp with real local time and motion
      if (result.metadata) {
        result.metadata.generatedAt = new Date().toISOString();
        (result.metadata as Record<string, unknown>).motion = data.motion;
      }
      setDiscoveredSources(sources);
      setGenerateResult(result);
      setRecordedCaseId(null);
      setRestoredSnapshot(false);
      setResultDebateId(target.debateId);
      setGenerateResultDebateId(target.debateId);
      await workspace.attach(data, result);
      if (target.debateId) {
        const recordedId = await recordInDebate(() => recordResult('case', { title: data.motion, input: data, output: result, debateId: target.debateId, side: data.side }));
        setRecordedCaseId(recordedId);
        if (recordedId) markResultSaved(result);
      }
      results.reveal();
    } catch (error) {
      if (isCanceled(error, signal)) return;
      console.error('Failed to generate case:', error);

      // Handle subscription errors with modals
      if (subError.handleSubscriptionError(error)) return;

      if (isAIAuthError(error)) {
        run.setError({ title: t('generate.authRequired'), description: getUserFacingAIError(error) });
      } else if (isAIRateLimitError(error)) {
        run.setError({ title: t('rateLimit.title'), description: getUserFacingAIError(error) });
      } else if (isTimeoutError(error)) {
        run.setError({ title: t('generate.timeout'), description: t('generate.timeoutDesc') });
      } else {
        run.setError({ title: t('generate.failed'), description: getUserFacingAIError(error) });
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRegenerateSection = (section: string) => {
    if (generateLoading || regeneratingSection) return;
    const motion = generateResult?.metadata?.motion?.trim() || generateForm?.motion;
    if (!motion || !generateResult) {
      toast({ title: t('generate.regenerateUnavailable', 'Cannot regenerate yet'), description: t('generate.regenerateUnavailableDesc', 'Generate a case first, then retry a section.'), variant: 'destructive' });
      return;
    }

    const data: GenerateInput = {
      motion,
      side: generateResult.metadata?.side || generateForm?.side || 'pro',
      format: generateForm?.format || 'custom',
      role: generateForm?.role || 'r1',
      length: generateForm?.length || 'standard',
      audience: generateForm?.audience || 'intermediate',
      tone: generateForm?.tone || 'formal',
    };

    // Regenerate against the result's own debate, never whichever is current now.
    // A loaded case records that debate on the store; this page's state only
    // knows it until the student leaves and comes back.
    const current = selectCurrentDebate(useDebateStore.getState());
    const debateId = resultDebateId !== undefined
      ? resultDebateId
      : generateResultDebateId !== undefined
        ? generateResultDebateId
        : sameMotion(current?.motion, data.motion) ? activeDebateId() : null;
    // One section at a time: each regeneration merges into the result it started from.
    const base = generateResult;
    setGenerateRegeneratingSection(section);
    void generateCase(data, config, workspace.context ?? undefined, workspace.context ? undefined : debateId)
      .then(async ({ result: next, discoveredSources: sources }) => {
        // Undo or a new generation replaced the case meanwhile; merging now would revert it.
        if (useSessionStore.getState().generateResult !== base) return;
        const regenerated = {
          ...base,
          ...(section === 'structure' ? { caseStructure: next.caseStructure } : {}),
          ...(section === 'contentions' ? { contentions: next.contentions } : {}),
          ...(section === 'opponent' ? { predictedOpponentCase: next.predictedOpponentCase } : {}),
          ...(section === 'counters' ? { counters: next.counters } : {}),
          ...(section === 'exordio' ? { exordio: next.exordio } : {}),
          metadata: next.metadata,
        };
        setGenerateResult(regenerated);
        setDiscoveredSources(sources);
        await workspace.attach({ ...data, regeneratedSection: section }, regenerated);
        if (recordedCaseId && !restoredSnapshot) {
          await updateRecordedResult('case', recordedCaseId, regenerated);
          markResultSaved(regenerated);
        }
        toast({ title: t('generate.regenerated', 'Section regenerated'), description: t('generate.regeneratedDesc', 'The selected section has been refreshed.'), variant: 'success' });
      })
      .catch((error) => {
        // Out of uses: the same dialog as a full generation, not a toast.
        if (subError.handleSubscriptionError(error)) return;
        console.error('Failed to regenerate section:', error);
        toast({ title: t('generate.failed'), description: getUserFacingAIError(error), variant: 'destructive' });
      })
      .finally(() => setGenerateRegeneratingSection(null));
  };

  const handleSave = () => {
    if (!generateResult) return;
    setSaveTitle(generateForm?.motion || generateResult.caseStructure.thesis.slice(0, 50));
    setSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    const title = saveTitle.trim();
    if (!title) return;
    // The case on screen when Save was confirmed is the one saved, even if a regenerate lands meanwhile.
    const saving = useSessionStore.getState().generateResult;
    try {
      await saveCurrentCase(title);
      markResultSaved(saving);
      setSaveDialogOpen(false);
      toast({
        title: t('generate.saved'),
        description: t('generate.savedDesc'),
        variant: 'success',
        // The owl celebrates beside the success check, so the meaning never rests on the owl or the colour.
        icon: (
          <span className="flex items-center gap-2">
            <Owl pose="celebrating" size={44} priority className="-my-2" />
            <span className="flex size-8 items-center justify-center rounded-full bg-success-tint text-success-text"><Check className="size-4" strokeWidth={3} /></span>
          </span>
        ),
      });
    } catch (error) {
      console.error('Failed to save case:', error);
      toast({
        title: t('ask.saveFailed', 'Save failed'),
        description: t('generate.saveFailedDesc', 'The case could not be saved. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleDiscuss = () => {
    if (generateResult) openDiscussion(navigate, generateDiscussPrompt(generateResult, t));
  };

  const handlePracticeCrossfire = () => {
    if (!generateResult) return;
    navigate('/app/crossfire', {
      state: {
        ...prefillFromGenerate(generateForm?.motion ?? generateResult.caseStructure.thesis, generateResult),
        ...(workspace.context ? workspaceRouteState(workspace.context) : {}),
      },
    });
  };

  const handleImportFlowchart = () => {
    if (!caseHasFlowchart(generateResult)) {
      toast({ title: t('generate.flowchartImportFailed'), description: t('generate.flowchartNoData'), variant: "destructive" });
      return;
    }
    // The flowchart files its chart in the current debate, so only that debate's case goes there.
    const { oneOff, currentDebateId } = useDebateStore.getState();
    if (!workspace.context && (generateResultDebateId === undefined || generateResultDebateId !== (oneOff ? null : currentDebateId))) {
      toast({ title: t('generate.flowchartImportFailed'), description: t('generate.flowchartOtherDebate'), variant: "destructive" });
      return;
    }

    try {
      setPendingFlowchartData(flowchartFromCase(generateResult, t));
      navigate('/app/flowchart');
      toast({ title: t('generate.flowchartImported'), description: t('generate.flowchartImportedDesc') });
    } catch (error) {
      console.error('Failed to import flowchart:', error);
      toast({ title: t('generate.flowchartImportFailed'), description: t('generate.flowchartImportFailedDesc'), variant: "destructive" });
    }
  };

  return (
    <>
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-6xl mx-auto">
        <PageHeader title={t('nav.generate')} meta={<DailyUsage />} />
        <CurrentDebateStrip side={generateForm?.side} hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <GenerateForm onSubmit={handleSubmit} isLoading={generateLoading || regeneratingSection !== null} debatePrefill={!workspace.context} />
          </div>

          {/* Results */}
          <div ref={results.ref} className="scroll-mt-24">
            {run.error && (
              <ToolRunErrorPanel
                error={run.error}
                onRetry={lastRun.current ? () => void submitGenerate(lastRun.current!.data, lastRun.current!.debateId) : undefined}
                onDismiss={run.clearError}
              />
            )}
            {generateLoading ? (
              <LiveToolRun label={t('generate.working', 'Writing your case…')} live={run.liveState} sections={run.liveState.draft ? generateDraftSections(run.liveState.draft, t) : []} onCancel={run.cancel} pose="thinking" />
            ) : generateResult ? (
              <div key="generate-results" id="generate-results" className="space-y-4">
                <GenerateResults
                  result={generateResult}
                  discoveredSources={discoveredSources}
                  onRegenerateSection={handleRegenerateSection}
                  regeneratingSection={regeneratingSection}
                  onDiscuss={handleDiscuss}
                  onSave={handleSave}
                  saved={resultSaved}
                  onUndo={handleUndo}
                  onImportFlowchart={handleImportFlowchart}
                  onPracticeCrossfire={handlePracticeCrossfire}
                />
              </div>
            ) : (
              <EmptyState icon={Target} pose={run.error ? 'surprised' : 'point'} title={t('generate.emptyTitle')} description={t('generate.emptyDesc')} />
            )}
          </div>
        </div>
      </div>
    </div>

    {debateGate.dialog}
    <SubscriptionErrorModals subError={subError} />
    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('generate.saveCase', 'Save case')}</DialogTitle>
          <DialogDescription>{t('generate.savePrompt')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="case-title">{t('generate.caseTitle', 'Case title')}</Label>
          <Input id="case-title" value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveTitle.trim()) void confirmSave(); }} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={confirmSave} disabled={!saveTitle.trim()}>
            <Save className="h-4 w-4 mr-1" />
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
