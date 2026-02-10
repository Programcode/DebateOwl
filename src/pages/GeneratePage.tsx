// src/pages/GeneratePage.tsx
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { generateCase, askChat, isAIAuthError, isAIRateLimitError, isTimeoutError } from '@/lib/ai/client';
import type { GenerateInput } from '@/lib/ai/schemas/generate';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { LimitReachedModal, PricingModal } from '@/components/features/subscription';
import { MarkerType, type Node as ReactFlowNode, type Edge as ReactFlowEdge } from 'reactflow';

import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

export default function GeneratePage() {
  const { generateResult, generateLoading, setGenerateResult, setGenerateLoading, saveCurrentCase, addAskMessage, setAskLoading, askMessages, setPendingFlowchartData } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('generate');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();

  const handleSubmit = async (data: GenerateInput) => {
    setGenerateLoading(true);
    try {
      const result = await generateCase(data, config);
      setGenerateResult(result);
    } catch (error) {
      console.error('Failed to generate case:', error);

      // Handle subscription errors with modals
      if (subError.handleSubscriptionError(error)) return;

      if (isAIAuthError(error)) {
        toast({ title: "Authentication Required", description: error.message, variant: "destructive" });
      } else if (isAIRateLimitError(error)) {
        toast({ title: "Rate Limit Exceeded", description: `${error.message}${error.limit ? ` (${error.current}/${error.limit} requests)` : ''}`, variant: "destructive" });
      } else if (isTimeoutError(error)) {
        toast({ title: "Request Timed Out", description: "The AI took too long to respond. Please try again.", variant: "destructive" });
      } else {
        toast({ title: "Generation Failed", description: error instanceof Error ? error.message : "An unexpected error occurred", variant: "destructive" });
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRegenerateSection = (section: string) => {
    // For now, regenerate entire case
    // TODO: Implement section-specific regeneration
    console.log('Regenerate section:', section);
  };

  const handleSave = () => {
    if (!generateResult) return;
    const title = window.prompt("Enter a title for this case:", generateResult.caseStructure.thesis.slice(0, 50));
    if (title) {
      saveCurrentCase(title);
      toast({ title: "Case Saved", description: "Your case has been saved to history." });
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
      toast({ title: "Chat Error", description: "Failed to generate response.", variant: "destructive" });
    } finally {
      setAskLoading(false);
    }
  };

  const handleImportFlowchart = () => {
    if (!generateResult) return;

    // We can use 'any' or more specific types if we import them from ReactFlow or our store
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

    // Contentions
    generateResult.contentions.forEach((c, i) => {
      const id = `c-${i}`;
      // Spread contentions horizontally
      const xPos = centerX + ((i - (generateResult.contentions.length - 1) / 2) * 300);

      nodes.push({
        id,
        type: 'custom',
        position: { x: xPos, y: 250 },
        data: {
          label: `Argument ${i + 1}`,
          description: c.claim,
          type: 'argument',
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

      // Add counters/attacks if available?
      // For now, let's just add the main structure to keep it clean, 
      // or maybe add predicted attacks below contentions if they map nicely.
      // Since predictedOpponentCase is a flat list, we'll just add them as a group below.
    });

    // Attacks (Predicted Opponent Case)
    // We'll just list them in a row below contentions for now
    if (generateResult.predictedOpponentCase?.likelyArguments) {
      generateResult.predictedOpponentCase.likelyArguments.forEach((arg, i) => {
        const id = `a-${i}`;
        const xPos = centerX + ((i - (generateResult.predictedOpponentCase.likelyArguments.length - 1) / 2) * 300);

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

        // No edges for now as we don't know which contention they target
      });
    }

    setPendingFlowchartData({ nodes, edges });
    navigate('/app/flowchart');
    toast({ title: "Case Imported", description: "Your case has been imported to Flowcharts." });
  };

  return (
    <>
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Generate Arguments</h1>
          <p className="text-muted-foreground mt-1">
            Create structured debate cases with AI-powered argument generation
          </p>
        </div>

        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <GenerateForm onSubmit={handleSubmit} isLoading={generateLoading} />
          </div>

          {/* Results */}
          <div>
            {generateResult ? (
              <div className="space-y-4">
                <GenerateResults
                  result={generateResult}
                  onRegenerateSection={handleRegenerateSection}
                  onDiscuss={handleDiscuss}
                  onSave={handleSave}
                  onImportFlowchart={handleImportFlowchart}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-border bg-card/50 p-8 text-center">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter your motion and preferences to generate a complete debate case with arguments, counters, and strategic analysis.
                </p>
              </div>
            )}
          </div>
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
    <PricingModal
      open={subError.pricingModalOpen}
      onOpenChange={subError.setPricingModalOpen}
    />
    </>
  );
}
