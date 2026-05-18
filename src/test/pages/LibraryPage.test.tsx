import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: vi.fn(() => mockStore),
}));

import LibraryPage from '@/pages/LibraryPage';

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.sourceLibrary = [];
    window.confirm = vi.fn(() => false);
  });

  it('renders page title', () => {
    render(<LibraryPage />);
    expect(screen.getByText('Source Library')).toBeDefined();
  });

  it('renders subtitle', () => {
    render(<LibraryPage />);
    expect(screen.getByText('Manage sources for grounded AI responses')).toBeDefined();
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
