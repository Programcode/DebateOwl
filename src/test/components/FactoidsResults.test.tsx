import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { DiscoveredSource } from '@/lib/ai/client';

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

test('renders consulted sources with a fallback label for weak sources', () => {
  const discoveredSources: DiscoveredSource[] = [{
    title: 'Broad fallback article',
    url: 'https://example.com/fallback',
    qualityLabel: 'weak',
    qualityScore: 20,
  }];

  render(<FactoidsResults result={result} discoveredSources={discoveredSources} />);

  expect(screen.getByRole('heading', { name: /researched sources/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /broad fallback article/i })).toHaveAttribute('href', discoveredSources[0].url);
  expect(screen.getByText('fallback context only')).toBeInTheDocument();
});

test('names the save action with the factoid claim', () => {
  render(<FactoidsResults result={{
    ...result,
    factoids: [{
      ...result.factoids[0],
      shortClaim: 'Solar costs fell by 42 percent',
      citation: { ...result.factoids[0].citation, verified: 'verified' },
    }],
  }} onSaveSource={vi.fn()} />);

  expect(screen.getByRole('button', {
    name: 'Save Solar costs fell by 42 percent to library',
  })).toBeInTheDocument();
});
