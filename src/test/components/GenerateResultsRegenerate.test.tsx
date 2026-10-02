import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test' }, session: { access_token: 'test' } }),
}));

const result: GenerateOutput = {
  caseStructure: { thesis: 'Distinct thesis text', framework: 'Framework', keyDefinitions: [], burdenOfProof: 'Burden' },
  contentions: [{ id: 'c1', claim: 'First claim', reasoning: 'Because', evidence: 'Data', needsSource: false, impact: 'Big' }],
  predictedOpponentCase: { likelyArguments: ['Their point'], strategicWeaknesses: [], keyClashes: [] },
  counters: [{ targetArgument: 'Their point', counterpoint: 'Our answer', rebuttal: 'Rebuttal' }],
  metadata: { side: 'pro', format: 'custom', generatedAt: '2026-10-02T10:00:00.000Z' },
};

describe('GenerateResults section regeneration', () => {
  it('covers only the regenerating section and keeps the other sections visible', () => {
    render(<GenerateResults result={result} onRegenerateSection={vi.fn()} regeneratingSection="contentions" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Regenerating');
    const contentionsCard = status.closest('.card-hover-glow') as HTMLElement;
    expect(within(contentionsCard).getByText('First claim')).toBeInTheDocument();
    expect(screen.getByText('Distinct thesis text')).toBeInTheDocument();
    expect(screen.getByText('Our answer')).toBeInTheDocument();

    // Every regenerate button waits for the running section to finish.
    const buttons = screen.getAllByRole('button', { name: /^Regenerate / });
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it('leaves every section enabled when nothing is regenerating', () => {
    render(<GenerateResults result={result} onRegenerateSection={vi.fn()} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Regenerate / })) expect(button).toBeEnabled();
  });
});
