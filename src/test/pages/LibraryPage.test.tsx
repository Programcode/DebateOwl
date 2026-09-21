/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '@/i18n';

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockStore = {
  sourceLibrary: [] as any[],
  sourceFolders: ['General'] as string[],
  addSource: vi.fn(),
  createSourceFolder: vi.fn(),
  updateSource: vi.fn(),
  renameSourceFolder: vi.fn(),
  deleteSourceFolder: vi.fn(),
  setFolderActive: vi.fn(),
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
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockStore.sourceLibrary = [];
    mockStore.sourceFolders = ['General'];
    mockStore.addSource.mockResolvedValue(undefined);
    mockStore.createSourceFolder.mockResolvedValue(undefined);
    mockStore.updateSource.mockResolvedValue(undefined);
    mockStore.renameSourceFolder.mockResolvedValue(undefined);
    mockStore.deleteSourceFolder.mockResolvedValue(undefined);
    mockStore.setFolderActive.mockResolvedValue(undefined);
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
      { id: '1', title: 'Source 1', content: 'Content', type: 'text', isActive: true, createdAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Source 1')).toBeDefined();
  });

  it('renders multiple sources', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Source A', content: 'A', type: 'text', isActive: true, createdAt: Date.now() },
      { id: '2', title: 'Source B', content: 'B', type: 'url', isActive: false, createdAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Source A')).toBeDefined();
    expect(screen.getByText('Source B')).toBeDefined();
  });

  it('defaults to Smart ordering and puts case-used evidence first', () => {
    mockStore.sourceLibrary = [
      { id: 'new', title: 'New source', content: 'A', type: 'text', isActive: true, createdAt: 2 },
      { id: 'used', title: 'Used source', content: 'B', type: 'text', isActive: true, createdAt: 1, metadata: { semantic: { relevance: 0.8, importance: 2, strength: 3, evaluatedAt: '2026-09-21T00:00:00.000Z', useCount: 4, caseUseCount: 1, lastUsedInCase: true } } },
    ];
    render(<LibraryPage />);

    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveTextContent('Smart');
    const labels = screen.getAllByText(/source$/i).map((element) => element.textContent);
    expect(labels.indexOf('Used source')).toBeLessThan(labels.indexOf('New source'));
    expect(screen.getByText('Used in this case')).toBeInTheDocument();
  });

  it('shows grounding status', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Active Source', content: 'C', type: 'text', isActive: true, createdAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Grounding Active')).toBeDefined();
  });

  it('shows grounding disabled when no active sources', () => {
    mockStore.sourceLibrary = [
      { id: '1', title: 'Inactive', content: 'C', type: 'text', isActive: false, createdAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText('Grounding Disabled')).toBeDefined();
  });

  it('add form has save button', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText('Add Source'));
    expect(screen.getByText('Save to Library')).toBeDefined();
  });

  it('localizes validation errors in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    render(<LibraryPage />);

    fireEvent.click(screen.getByText('Forrás Hozzáadása'));
    fireEvent.click(screen.getByText('Mentés a Könyvtárba'));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hiba' }));
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
      { id: '1', title: 'S1', content: 'C', type: 'text', isActive: true, createdAt: Date.now() },
    ];
    render(<LibraryPage />);
    expect(screen.getByText(/1 sources/)).toBeDefined();
  });

  it('localizes the canonical General folder and source controls in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    mockStore.sourceLibrary = [
      { id: '1', title: 'Forrás', content: 'Bizonyíték', type: 'text', folder: 'General', isActive: true, createdAt: Date.now() },
      { id: '2', title: 'Fájlforrás', content: 'Bizonyíték', type: 'file', folder: 'General', isActive: true, createdAt: Date.now() },
      { id: '3', title: 'Webforrás', content: 'Bizonyíték', type: 'url', folder: 'General', isActive: true, createdAt: Date.now() },
    ];

    render(<LibraryPage />);

    expect(screen.getAllByText('Általános').length).toBeGreaterThan(0);
    expect(screen.getByText('Szöveg')).toBeInTheDocument();
    expect(screen.getByText('Fájl')).toBeInTheDocument();
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forrás törlése' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Forrás be- vagy kikapcsolása' })).toBeInTheDocument();
  });

  it('opens a source detail sheet and saves edits', async () => {
    mockStore.sourceFolders = ['General', 'Round 1'];
    mockStore.sourceLibrary = [
      {
        id: '1',
        title: 'Editable Source',
        content: 'Original evidence text',
        type: 'text',
        folder: 'General',
        isActive: true,
        createdAt: Date.now(),
      },
    ];
    render(<LibraryPage />);

    fireEvent.click(screen.getByText('Editable Source'));
    const titleInput = await screen.findByDisplayValue('Editable Source');
    fireEvent.change(titleInput, { target: { value: 'Updated Source' } });
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Updated evidence text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockStore.updateSource).toHaveBeenCalledWith('1', expect.objectContaining({
        title: 'Updated Source',
        content: 'Updated evidence text',
        folder: 'General',
      }));
    });
  });

  it('renames the selected source folder', async () => {
    mockStore.sourceFolders = ['General', 'Round 1'];
    mockStore.sourceLibrary = [
      {
        id: '1',
        title: 'Round Source',
        content: 'Evidence text',
        type: 'text',
        folder: 'Round 1',
        isActive: true,
        createdAt: Date.now(),
      },
    ];
    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Round 1' }));
    const renameInput = (await screen.findAllByLabelText('Rename folder'))[0];
    fireEvent.change(renameInput, { target: { value: 'Finals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename folder' }));

    await waitFor(() => {
      expect(mockStore.renameSourceFolder).toHaveBeenCalledWith('Round 1', 'Finals');
    });
  });

  it('can deactivate a selected folder', async () => {
    mockStore.sourceFolders = ['General', 'Round 1'];
    mockStore.sourceLibrary = [
      {
        id: '1',
        title: 'Round Source',
        content: 'Evidence text',
        type: 'text',
        folder: 'Round 1',
        isActive: true,
        createdAt: Date.now(),
      },
    ];
    render(<LibraryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Round 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mockStore.setFolderActive).toHaveBeenCalledWith('Round 1', false);
    });
  });
});
