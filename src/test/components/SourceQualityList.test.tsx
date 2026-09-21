import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceQualityList } from '@/components/features/shared/SourceQualityList';
import type { DiscoveredSource } from '@/lib/ai/client';
import i18n from '@/i18n';

describe('SourceQualityList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders nothing when there are no sources', () => {
    const { container } = render(<SourceQualityList sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows source type, quality label, and a link for each source', () => {
    const sources: DiscoveredSource[] = [
      {
        title: 'Ministry report',
        url: 'https://kormany.hu/report',
        sourceType: 'government',
        qualityLabel: 'strong',
        qualityScore: 82,
      },
    ];
    render(<SourceQualityList sources={sources} />);
    expect(screen.getByText('Ministry report')).toBeInTheDocument();
    expect(screen.getByText('Government')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ministry report/i })).toHaveAttribute('href', 'https://kormany.hu/report');
  });

  it('labels weak sources as fallback context instead of evidence', () => {
    const sources: DiscoveredSource[] = [
      {
        title: 'Forum thread',
        url: 'https://reddit.com/r/debate/thread',
        sourceType: 'social',
        qualityLabel: 'weak',
        qualityScore: 10,
      },
    ];
    render(<SourceQualityList sources={sources} />);
    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(screen.getByText(/fallback context/i)).toBeInTheDocument();
  });

  it('marks moderate sources as usable citations', () => {
    const sources: DiscoveredSource[] = [
      {
        title: 'News analysis',
        url: 'https://telex.hu/article',
        sourceType: 'news',
        qualityLabel: 'moderate',
        qualityScore: 55,
      },
    ];
    render(<SourceQualityList sources={sources} />);
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.queryByText(/fallback context/i)).not.toBeInTheDocument();
  });

  it('localizes source metadata in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    render(<SourceQualityList sources={[{
      title: 'Kormányzati jelentés',
      url: 'https://kormany.hu/jelentes',
      sourceType: 'government',
      qualityLabel: 'strong',
    }]} />);

    expect(screen.getByText('Kormányzati')).toBeInTheDocument();
    expect(screen.getByText('Erős')).toBeInTheDocument();
  });
});
