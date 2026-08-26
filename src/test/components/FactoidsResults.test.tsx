import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';

vi.mock('@/components/features/ExportToolbar', () => ({
  ExportToolbar: (): null => null,
}));
vi.mock('@/components/features/export/GoogleDriveAuthModal', () => ({
  GoogleDriveAuthModal: (): null => null,
}));

const result: FactoidsOutput = {
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

test('shows every consulted source with quality labels and weak-source warning', () => {
  render(
    <FactoidsResults
      result={result}
      consultedSources={[
        {
          title: 'Official statistics',
          url: 'https://www.census.gov/example',
          sourceType: 'government',
          qualityLabel: 'strong',
          qualityScore: 92,
          query: 'official statistics',
        },
        {
          title: 'Broad fallback discussion',
          url: 'https://www.reddit.com/r/example',
          sourceType: 'social',
          qualityLabel: 'weak',
          qualityScore: 18,
          query: 'broad discussion',
        },
      ]}
    />,
  );

  expect(screen.getByText('Sources consulted')).toBeInTheDocument();
  expect(screen.getByText('Official statistics')).toBeInTheDocument();
  expect(screen.getByText('Broad fallback discussion')).toBeInTheDocument();
  expect(screen.getByText('strong')).toBeInTheDocument();
  expect(screen.getByText('weak')).toBeInTheDocument();
  expect(screen.getByText(/fallback context only/i)).toBeInTheDocument();
});
