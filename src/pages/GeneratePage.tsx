// src/pages/GeneratePage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { generateCase } from '@/lib/ai/client';
import type { GenerateInput } from '@/lib/ai/schemas/generate';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

export default function GeneratePage() {
  const { generateResult, generateLoading, setGenerateResult, setGenerateLoading, saveCurrentCase } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('generate');
  const { toast } = useToast();

  const handleSubmit = async (data: GenerateInput) => {
    setGenerateLoading(true);
    try {
      const result = await generateCase(data, config);
      setGenerateResult(result);
    } catch (error) {
      console.error('Failed to generate case:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
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

  return (
    <div className="container py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Generate Arguments</h1>
          <p className="text-muted-foreground mt-1">
            Create structured debate cases with AI-powered argument generation
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <GenerateForm onSubmit={handleSubmit} isLoading={generateLoading} />
          </div>

          {/* Results */}
          <div>
            {generateResult ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleSave}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Case
                  </Button>
                </div>
                <GenerateResults result={generateResult} onRegenerateSection={handleRegenerateSection} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border-2 border-dashed border-border bg-card/50 p-8 text-center">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter your motion and preferences to generate a complete debate case with contentions, counters, and strategic analysis.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
