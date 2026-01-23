// src/pages/GeneratePage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { mockGenerateCase } from '@/lib/ai/providers/mock-provider';
import type { GenerateInput } from '@/lib/ai/schemas/generate';

export default function GeneratePage() {
  const { generateResult, generateLoading, setGenerateResult, setGenerateLoading } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('generate');

  const handleSubmit = async (data: GenerateInput) => {
    setGenerateLoading(true);
    try {
      // Use mock provider for demo
      if (config.provider === 'mock') {
        const result = await mockGenerateCase(data.motion, data.side);
        setGenerateResult(result);
      } else {
        // TODO: Implement real AI provider calls
        const result = await mockGenerateCase(data.motion, data.side);
        setGenerateResult(result);
      }
    } catch (error) {
      console.error('Failed to generate case:', error);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRegenerateSection = (section: string) => {
    // For now, regenerate entire case
    // TODO: Implement section-specific regeneration
    console.log('Regenerate section:', section);
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
              <GenerateResults result={generateResult} onRegenerateSection={handleRegenerateSection} />
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
