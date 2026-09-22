import { render, screen } from '@testing-library/react';
import SourcesPage from '@/pages/SourcesPage';
import i18n from '@/i18n';

test('does not present a stale consultation date as current source metadata', () => {
  render(<SourcesPage />);

  expect(screen.queryByText(/Consulta: 8 de marzo de 2026/i)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /cambridge\.org/i })).toBeInTheDocument();
});

test('renders Hungarian page chrome without translating publication titles', async () => {
  await i18n.changeLanguage('hu');
  render(<SourcesPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Források' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Hivatkozások' })).toBeInTheDocument();
  expect(screen.getByText(/az alábbi forrásokat használtuk fel/i)).toBeInTheDocument();
  expect(screen.getByText('Enhancing critical thinking skills with AI-assisted technology.')).toBeInTheDocument();

  await i18n.changeLanguage('en');
});
