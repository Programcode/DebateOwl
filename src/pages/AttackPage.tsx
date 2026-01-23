// src/pages/AttackPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { mockAttackCase } from '@/lib/ai/providers/mock-provider';
import type { AttackInput } from '@/lib/ai/schemas/attack';

export default function AttackPage() {
  const { attackResult, attackLoading, setAttackResult, setAttackLoading } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('attack');

  const handleSubmit = async (data: AttackInput) => {
    setAttackLoading(true);
    try {
      if (config.provider === 'mock') {
        const result = await mockAttackCase(data.caseText);
        setAttackResult(result);
      } else {
        const result = await mockAttackCase(data.caseText);
        setAttackResult(result);
      }
    } catch (error) {
      console.error('Failed to attack case:', error);
    } finally {
      setAttackLoading(false);
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
              <AttackResults result={attackResult} />
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
