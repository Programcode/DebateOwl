import { render, screen } from '@testing-library/react';
import SourcesPage from '@/pages/SourcesPage';

test('does not present a stale consultation date as current source metadata', () => {
  render(<SourcesPage />);

  expect(screen.queryByText(/Consulta: 8 de marzo de 2026/i)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /cambridge\.org/i })).toBeInTheDocument();
});
