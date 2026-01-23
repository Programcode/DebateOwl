// src/pages/FactoidsPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { FactoidsForm } from '@/components/features/factoids/FactoidsForm';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import { mockFactoids } from '@/lib/ai/providers/mock-provider';
import type { FactoidsInput } from '@/lib/ai/schemas/factoids';

export default function FactoidsPage() {
  const { factoidsResult, factoidsLoading, setFactoidsResult, setFactoidsLoading } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('factoids');

  const handleSubmit = async (data: FactoidsInput) => {
    setFactoidsLoading(true);
    try {
      if (config.provider === 'mock') {
        const result = await mockFactoids(data.claim);
        setFactoidsResult(result);
      } else {
        const result = await mockFactoids(data.claim);
        setFactoidsResult(result);
      }
    } catch (error) {
      console.error('Failed to find factoids:', error);
    } finally {
      setFactoidsLoading(false);
    }
  };

  const handleVerify = async () => {
    // TODO: Implement verification
    console.log('Verifying sources...');
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
              <FactoidsResults result={factoidsResult} onVerify={handleVerify} />
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
    </div>
  );
}
