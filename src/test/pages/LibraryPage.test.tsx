/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockStore = {
  sourceLibrary: [] as any[],
  addSource: vi.fn(),
  removeSource: vi.fn(),
  toggleSource: vi.fn(),
  clearLibrary: vi.fn(),
};

const importSourceFromUrlMock = vi.fn();

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: vi.fn(() => mockStore),
}));

vi.mock('@/lib/source-import', () => ({
  importSourceFromUrl: (...args: unknown[]) => importSourceFromUrlMock(...args),
}));

import LibraryPage from '@/pages/LibraryPage';

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.sourceLibrary = [];
    mockStore.addSource.mockResolvedValue(undefined);
    mockStore.removeSource.mockResolvedValue(undefined);
    mockStore.toggleSource.mockResolvedValue(undefined);
    mockStore.clearLibrary.mockResolvedValue(undefined);
    window.confirm = vi.fn(() => false);
  });

  it('renders page title', () => {
    render(<LibraryPage />);
    expect(screen.getByText('Source Library')).toBeDefined();
  });

  it('renders title', () => {
    render(<LibraryPage />);
    expect(screen.getByText('Source Library')).toBeDefined();
  });

  it('shows empty state when no sources', () => {
    render(<LibraryPage />);
    expect(screen.getByText('No Sources Yet')).toBeDefined();
  });

  it('renders add source button', () => {
    render(<LibraryPage />);
    expect(screen.getByText('Add Source')).toBeDefined();
  });

  it('shows add form on button click', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    expect(screen.getByText('Add New Source')).toBeDefined();
  });

  it('shows cancel text after clicking add', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('hides form on cancel click', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Add New Source')).toBeNull();
  });

  it('renders sources when present', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Source 1', content: 'Content', type: 'text', isActive: true, addedAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Source 1')).toBeDefined();
  });

  it('renders multiple sources', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Source A', content: 'A', type: 'text', isActive: true, addedAt: Date.now() },
      { id: '2', title: 'Source B', content: 'B', type: 'url', isActive: false, addedAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Source A')).toBeDefined();
    expect(screen.getByText('Source B')).toBeDefined();
  });

  it('shows grounding status', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Active Source', content: 'C', type: 'text', isActive: true, addedAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Grounding Active')).toBeDefined();
  });

  it('shows grounding disabled when no active sources', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Inactive', content: 'C', type: 'text', isActive: false, addedAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Grounding Disabled')).toBeDefined();
  });

  it('add form has save button', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    expect(screen.getByText('Save to Library')).toBeDefined();
  });

  it('imports a URL into a preview and saves it', async () => {
    importSourceFromUrlMock.mockResolvedValue({
      title: 'Imported Article',
      content: 'Imported content with enough debate evidence.',
      wordCount: 6,
      domain: 'example.com',
      excerpt: 'Imported content',
      url: 'https://example.com/article',
    });

    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    fireEvent.change(screen.getByLabelText('Import from URL'), {
      target: { value: 'https://example.com/article' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import URL' }));

    expect(await screen.findByText('Import preview')).toBeDefined();
    expect(screen.getByDisplayValue('Imported Article')).toBeDefined();

    fireEvent.click(screen.getByText('Save imported source'));

    await waitFor(() => {
      expect(mockStore.addSource).toHaveBeenCalledWith({
        title: 'Imported Article',
        content: 'Imported content with enough debate evidence.',
        type: 'url',
        origin: 'https://example.com/article',
        folder: 'General',
      });
    });
  });

  it('imports a text file into a preview', async () => {
    const file = new File(['File source content for grounding.'], 'briefing.md', { type: 'text/markdown' });
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));

    const input = screen.getByLabelText('Import file');
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('Import preview')).toBeDefined();
    expect(screen.getByDisplayValue('briefing')).toBeDefined();
  });

  it('renders with container class', () => {
    const { container } = render(<LibraryPage />);
    expect(container.querySelector('.container')).not.toBeNull();
  });

  it('renders heading element', () => {
    const { container } = render(<LibraryPage />);
    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe('Source Library');
  });

  it('renders without crashing with empty library', () => {
    const { container } = render(<LibraryPage />);
    expect(container).toBeDefined();
  });

  it('shows source count badge', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'S1', content: 'C', type: 'text', isActive: true, addedAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText(/1 sources/)).toBeDefined();
  });
});
