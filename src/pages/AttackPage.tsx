// src/pages/AttackPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { attackCase, askChat } from '@/lib/ai/client';
import type { AttackInput } from '@/lib/ai/schemas/attack';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export default function AttackPage() {
  const { attackResult, attackLoading, setAttackResult, setAttackLoading, addAskMessage, setAskLoading, askMessages } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('attack'); // Actually we should use 'ask' config for the chat part
  const askConfig = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (data: AttackInput) => {
    setAttackLoading(true);
    try {
      const result = await attackCase(data, config);
      setAttackResult(result);
    } catch (error) {
      console.error('Failed to attack case:', error);
      toast({
        title: "Attack Analysis Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
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
      toast({ title: "Chat Error", description: "Failed to generate response.", variant: "destructive" });
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Attack My Case</h1>
          <p className="text-muted-foreground mt-1">
            Find weaknesses in your arguments before your opponents do
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <AttackForm onSubmit={handleSubmit} isLoading={attackLoading} />
          </div>

          {/* Results */}
          <div>
            {attackResult ? (
              <AttackResults result={attackResult} onDiscuss={handleDiscuss} />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 p-8 text-center">
                <div className="text-6xl mb-4">⚔️</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Mercy Mode</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Paste your argument to receive ruthless criticism, identify logical fallacies, and get actionable improvements.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
