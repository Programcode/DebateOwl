import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { FactoidsForm } from '@/components/features/factoids/FactoidsForm';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import { factoids, askChat } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { LimitReachedModal, PricingModal } from '@/components/features/subscription';
import type { FactoidsInput } from '@/lib/ai/schemas/factoids';
import { useToast } from '@/hooks/use-toast';

export default function FactoidsPage() {
  const { factoidsResult, factoidsLoading, setFactoidsResult, setFactoidsLoading, addAskMessage, setAskLoading, askMessages, addSource } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('factoids');
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();

  const handleSubmit = async (data: FactoidsInput) => {
    setFactoidsLoading(true);
    try {
      const result = await factoids(data, config);
      setFactoidsResult(result);
    } catch (error) {
      console.error('Failed to find factoids:', error);
      if (!subError.handleSubscriptionError(error)) {
        toast({
          title: "Research Failed",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive",
        });
      }
    } finally {
      setFactoidsLoading(false);
    }
  };

  const handleVerify = async () => {
    // TODO: Implement verification
    console.log('Verifying sources...');
  };

  const handleSaveToLibrary = (title: string, content: string, url?: string) => {
    addSource({ title, content, type: 'url', origin: url });
    toast({ title: "Saved to Library", description: "This evidence is now available for grounding." });
  };

  const handleDiscuss = async () => {
    if (!factoidsResult) return;

    const summary = `I'd like to discuss the evidence I found.
    
    **Factoids:**
    ${factoidsResult.factoids.slice(0, 3).map(f => `- ${f.shortClaim} (${f.citation.publisher})`).join('\n')}
    
    How can I best use this evidence?`;

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

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Factoids & Sources</h1>
          <p className="text-muted-foreground mt-1">
            Find debate-ready evidence with verifiable citations
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <FactoidsForm onSubmit={handleSubmit} isLoading={factoidsLoading} />
          </div>

          {/* Results */}
          <div>
            {factoidsResult ? (
              <FactoidsResults
                result={factoidsResult}
                onVerify={handleVerify}
                onDiscuss={handleDiscuss}
                onSaveSource={handleSaveToLibrary}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-secondary/30 bg-secondary/5 p-8 text-center">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Evidence That Wins</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter a claim to find supporting factoids with real citations, context, and guidance on how to use them effectively.
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
      <PricingModal
        open={subError.pricingModalOpen}
        onOpenChange={subError.setPricingModalOpen}
      />
    </div>
  );
}
