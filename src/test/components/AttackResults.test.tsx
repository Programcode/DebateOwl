import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttackResults } from '@/components/features/attack/AttackResults';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import i18n from '@/i18n';

vi.mock('@/components/features/export/GoogleDriveAuthModal', () => ({
  GoogleDriveAuthModal: (): null => null,
}));

const result: AttackOutput = {
  overallAssessment: { score: 50, summary: 'Összegzés', strengthAreas: [] },
  weaknesses: [{
    id: 'weakness-1',
    severity: 'major',
    type: 'logical',
    description: 'Leírás',
    whyWeak: 'Indoklás',
    howOpponentAttacks: 'Támadás',
    improvedVersion: 'Javítás',
  }],
  fallaciesDetected: [],
  crossExQuestions: [],
  weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
};

describe('AttackResults', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('hu');
  });

  it('localizes weakness types in Hungarian', () => {
    render(<AttackResults result={result} />);
    expect(screen.getByText('Logikai')).toBeInTheDocument();
    expect(screen.queryByText('logical')).not.toBeInTheDocument();
  });
});
