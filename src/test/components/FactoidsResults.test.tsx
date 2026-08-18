import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';

vi.mock('@/components/features/ExportToolbar', () => ({
  ExportToolbar: () => null,
}));
vi.mock('@/components/features/export/GoogleDriveAuthModal', () => ({
  GoogleDriveAuthModal: () => null,
}));

const result = {
  factoids: [{
    id: 'fact-1',
    shortClaim: 'A pending claim',
    keyFigure: '42%',
    context: 'Context',
    limitations: 'Limitations',
    citation: {
      title: 'Source',
      publisher: 'Publisher',
      verified: 'pending' as const,
    },
    howToUse: 'Use it carefully',
    relevanceScore: 80,
  }],
  searchSuggestions: [],
  warnings: [],
  verificationStatus: 'pending' as const,
};

test('does not expose source verification while no verification behavior exists', () => {
  render(<FactoidsResults result={result} />);

  expect(screen.queryByRole('button', { name: /verify all sources/i })).not.toBeInTheDocument();
});
