// src/pages/BrainstormPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { BrainstormForm } from '@/components/features/brainstorm/BrainstormForm';
import { BrainstormResults } from '@/components/features/brainstorm/BrainstormResults';
import { brainstorm } from '@/lib/ai/client';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { useToast } from '@/hooks/use-toast';

export default function BrainstormPage() {
  const { brainstormResult, brainstormLoading, setBrainstormResult, setBrainstormLoading } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('brainstorm');
  const { toast } = useToast();

  const handleSubmit = async (data: BrainstormInput) => {
    setBrainstormLoading(true);
    try {
      const result = await brainstorm(data.motion, data.outputMode, config);
      setBrainstormResult(result);
    } catch (error) {
      console.error('Failed to brainstorm:', error);
      toast({
        title: "Brainstorming Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setBrainstormLoading(false);
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Brainstorm Ideas</h1>
          <p className="text-muted-foreground mt-1">
            Explore argument angles with collaborative AI ideation
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <BrainstormForm onSubmit={handleSubmit} isLoading={brainstormLoading} />
          </div>

          {/* Results */}
          <div>
            {brainstormResult ? (
              <BrainstormResults result={brainstormResult} />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center">
                <div className="text-6xl mb-4">💡</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Unlock Creative Angles</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Describe your motion to explore unconventional argument angles, identify tradeoffs, and find your strongest positions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
