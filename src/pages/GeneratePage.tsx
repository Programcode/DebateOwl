// src/pages/GeneratePage.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { generateCase, askChat, isAIAuthError, isAIRateLimitError, isTimeoutError, type DiscoveredSource } from '@/lib/ai/client';
import type { GenerateInput } from '@/lib/ai/schemas/generate';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import { MarkerType, type Node as ReactFlowNode, type Edge as ReactFlowEdge } from 'reactflow';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import { AnimatedSection } from '@/components/ui/animated-section';
import { prefillFromGenerate } from '@/lib/crossfire/prefill';
import { useReducedMotion } from 'framer-motion';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { workspaceRouteState } from '@/lib/workspace/tool-context';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { useDebateMotionGate } from '@/components/features/debate/DebateMotionGate';

export default function GeneratePage() {
  const workspace = useWorkspaceToolScope('generate');
  const { generateResult, generateLoading, generateForm, setGenerateResult, setGenerateLoading, saveCurrentCase, addAskMessage, setAskLoading, askMessages, setPendingFlowchartData, autosavedCases, recordResult, updateRecordedResult } = useSessionStore();
  const debateGate = useDebateMotionGate({ disabled: Boolean(workspace.context) });
  // The debate row this page's current result was recorded into, if any.
  const [recordedCaseId, setRecordedCaseId] = useState<string | null>(null);
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('generate');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [successfulGenerationSequence, setSuccessfulGenerationSequence] = useState(0);
  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (successfulGenerationSequence === 0) return;
    const timer = window.setTimeout(() => {
      resultsAnchorRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [shouldReduceMotion, successfulGenerationSequence]);
  const [saveTitle, setSaveTitle] = useState('');
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);

  const handleUndo = () => {
    const prev = (autosavedCases || []).find(item => item.data !== generateResult);
    if (prev) {
      setGenerateResult(prev.data);
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
    setGenerateLoading(true);
    try {
      const { result, discoveredSources: sources } = await generateCase(data, config, workspace.context ?? undefined, workspace.context ? undefined : target.debateId);
      // Always stamp with real local time and motion
      if (result.metadata) {
        result.metadata.generatedAt = new Date().toISOString();
        (result.metadata as Record<string, unknown>).motion = data.motion;
      }
      setDiscoveredSources(sources);
      setGenerateResult(result);
      setRecordedCaseId(null);
      await workspace.attach(data, result);
      if (target.debateId) {
        setRecordedCaseId(await recordResult('case', { title: data.motion, input: data, output: result, debateId: target.debateId, side: data.side }));
      }
      setSuccessfulGenerationSequence((sequence) => sequence + 1);
      toast({ title: t('generate.complete', 'Generate complete'), description: t('generate.completeDesc', 'Your debate case is ready.'), variant: 'success' });
    } catch (error) {
      console.error('Failed to generate case:', error);

      // Handle subscription errors with modals
      if (subError.handleSubscriptionError(error)) return;

      if (isAIAuthError(error)) {
        toast({ title: t('generate.authRequired'), description: error.message, variant: "destructive" });
      } else if (isAIRateLimitError(error)) {
        toast({ title: t('rateLimit.title'), description: `${error.message}${error.limit ? ` (${error.current}/${error.limit} uses)` : ''}`, variant: "destructive" });
      } else if (isTimeoutError(error)) {
        toast({ title: t('generate.timeout'), description: t('generate.timeoutDesc'), variant: "destructive" });
      } else {
        toast({ title: t('generate.failed'), description: getUserFacingAIError(error), variant: "destructive" });
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRegenerateSection = (section: string) => {
    if (!generateForm?.motion || !generateResult) {
      toast({ title: t('generate.regenerateUnavailable', 'Cannot regenerate yet'), description: t('generate.regenerateUnavailableDesc', 'Generate a case first, then retry a section.'), variant: 'destructive' });
      return;
    }

    const data: GenerateInput = {
      motion: generateForm.motion,
      side: generateForm.side || 'pro',
      format: generateForm.format || 'custom',
      role: generateForm.role || 'r1',
      length: generateForm.length || 'standard',
      audience: generateForm.audience || 'intermediate',
      tone: generateForm.tone || 'formal',
    };

    setGenerateLoading(true);
    void generateCase(data, config, workspace.context ?? undefined)
      .then(async ({ result: next, discoveredSources: sources }) => {
        const regenerated = {
          ...generateResult,
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
        if (recordedCaseId) await updateRecordedResult('case', recordedCaseId, regenerated);
        toast({ title: t('generate.regenerated', 'Section regenerated'), description: t('generate.regeneratedDesc', 'The selected section has been refreshed.'), variant: 'success' });
      })
      .catch((error) => {
        console.error('Failed to regenerate section:', error);
        toast({ title: t('generate.failed'), description: getUserFacingAIError(error), variant: 'destructive' });
      })
      .finally(() => setGenerateLoading(false));
  };

  const handleSave = () => {
    if (!generateResult) return;
    setSaveTitle(generateForm?.motion || generateResult.caseStructure.thesis.slice(0, 50));
    setSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    const title = saveTitle.trim();
    if (!title) return;
    try {
      await saveCurrentCase(title);
      setSaveDialogOpen(false);
      toast({ title: t('generate.saved'), description: t('generate.savedDesc') });
    } catch (error) {
      console.error('Failed to save case:', error);
      toast({
        title: t('ask.saveFailed', 'Save failed'),
        description: t('ask.saveFailedDesc', 'The case could not be saved. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleDiscuss = async () => {
    if (!generateResult) return;

    const summary = `I'd like to discuss the case we just generated.
    
    **Thesis:** ${generateResult.caseStructure.thesis}
    
    **Arguments:**
    ${generateResult.contentions.map((c, i) => `${i + 1}. ${c.claim}`).join('\n')}
    
    Can we refine this?`;

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
    if (!generateResult?.caseStructure || !generateResult?.contentions) {
      toast({ title: t('generate.flowchartImportFailed'), description: t('generate.flowchartNoData'), variant: "destructive" });
      return;
    }

    try {
      const nodes: ReactFlowNode[] = [];
      const edges: ReactFlowEdge[] = [];
      const centerX = 400;

      // Thesis
      nodes.push({
        id: 'thesis',
        type: 'custom',
        position: { x: centerX, y: 50 },
        data: {
          label: 'Thesis',
          description: generateResult.caseStructure.thesis,
          type: 'thesis'
        }
      });

      // Contentions — use 'contention' type to match FlowchartPage nodeColors/nodeIcons
      const contentions = generateResult.contentions;
      contentions.forEach((c, i) => {
        const id = `c-${i}`;
        const xPos = centerX + ((i - (contentions.length - 1) / 2) * 300);

        nodes.push({
          id,
          type: 'custom',
          position: { x: xPos, y: 250 },
          data: {
            label: `Argument ${i + 1}`,
            description: c.claim,
            type: 'contention',
            strength: 'strong'
          }
        });

        edges.push({
          id: `e-thesis-${id}`,
          source: 'thesis',
          target: id,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed }
        });
      });

      // Attacks (Predicted Opponent Case)
      if (generateResult.predictedOpponentCase?.likelyArguments) {
        const attacks = generateResult.predictedOpponentCase.likelyArguments;
        attacks.forEach((arg, i) => {
          const id = `a-${i}`;
          const xPos = centerX + ((i - (attacks.length - 1) / 2) * 300);

          nodes.push({
            id,
            type: 'custom',
            position: { x: xPos, y: 450 },
            data: {
              label: `Attack ${i + 1}`,
              description: arg,
              type: 'attack'
            }
          });

          const targetContentionId = contentions.length ? `c-${i % contentions.length}` : 'thesis';
          edges.push({
            id: `e-${targetContentionId}-${id}`,
            source: targetContentionId,
            target: id,
            label: 'Attack',
            style: { stroke: '#ef4444', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed }
          });
        });
      }

      // Counters / Rebuttals — link each to its target contention
      if (generateResult.counters?.length) {
        generateResult.counters.forEach((counter, i) => {
          const id = `r-${i}`;
          // Find the contention this counter targets
          const targetIdx = contentions.findIndex(
            (c) => c.claim.toLowerCase().includes(counter.targetArgument?.toLowerCase() ?? '')
          );
          const parentId = targetIdx >= 0 ? `c-${targetIdx}` : 'thesis';
          const parentNode = nodes.find((n) => n.id === parentId);
          const xPos = parentNode ? parentNode.position.x + 50 : centerX + (i * 250);

          nodes.push({
            id,
            type: 'custom',
            position: { x: xPos, y: 650 },
            data: {
              label: `Rebuttal ${i + 1}`,
              description: counter.rebuttal || counter.counterpoint,
              type: 'rebuttal'
            }
          });

          edges.push({
            id: `e-${parentId}-${id}`,
            source: parentId,
            target: id,
            style: { stroke: '#3b82f6' },
            markerEnd: { type: MarkerType.ArrowClosed }
          });
        });
      }

      setPendingFlowchartData({ nodes, edges });
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
        <AnimatedSection className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('nav.generate')}</h1>
          </div>
        </AnimatedSection>
        <CurrentDebateStrip side={generateForm?.side} hidden={Boolean(workspace.context)} />

        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[440px_1fr]">
          {/* Form */}
          <AnimatedSection delay={75} className="lg:sticky lg:top-24 lg:self-start">
            <GenerateForm onSubmit={handleSubmit} isLoading={generateLoading} debatePrefill={!workspace.context} />
          </AnimatedSection>

          {/* Results */}
          <div>
            {generateLoading ? (
              <div key="generate-loading" className="motion-swap motion-shimmer flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/50 p-8">
                <StreamingIndicator messages={[t('generateForm.loadingMsg1'), t('generateForm.loadingMsg2'), t('generateForm.loadingMsg3'), t('generateForm.loadingMsg4'), t('generateForm.loadingMsg5')]} />
              </div>
            ) : generateResult ? (
              <div ref={resultsAnchorRef} key="generate-results" id="generate-results" className="space-y-4">
                <GenerateResults
                  result={generateResult}
                  discoveredSources={discoveredSources}
                  onRegenerateSection={handleRegenerateSection}
                  onDiscuss={handleDiscuss}
                  onSave={recordedCaseId ? undefined : handleSave}
                  onUndo={handleUndo}
                  onImportFlowchart={handleImportFlowchart}
                  onPracticeCrossfire={handlePracticeCrossfire}
                />
              </div>
            ) : (
              <div key="generate-empty" className="motion-swap flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/50 p-8 text-center">
                <div className="mb-4 text-6xl">🎯</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('generate.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('generate.emptyDesc')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {debateGate.dialog}
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
    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('generate.saveCase', 'Save case')}</DialogTitle>
          <DialogDescription>{t('generate.savePrompt')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="case-title">{t('generate.caseTitle', 'Case title')}</Label>
          <Input id="case-title" value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveTitle.trim()) confirmSave(); }} autoFocus />
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
