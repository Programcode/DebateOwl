/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockStore = {
  savedFlowcharts: [] as any[],
  savedCrossfires: [] as any[],
  sourceLibrary: [] as any[],
  savedCases: [] as any[],
  savedChats: [] as any[],
  savedAttacks: [] as any[],
  savedBrainstorms: [] as any[],
  savedFactoids: [] as any[],
  loadSavedCase: vi.fn(),
  loadSavedChat: vi.fn(),
  loadSavedAttack: vi.fn(),
  loadSavedBrainstorm: vi.fn(),
  loadSavedFactoids: vi.fn(),
};

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: vi.fn((selector?: (state: typeof mockStore) => unknown) => selector ? selector(mockStore) : mockStore),
}));

import HistoryPage from '@/pages/HistoryPage';
import { resetDebates, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

describe('HistoryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    seedCurrentDebate();
    mockStore.savedCases = [];
    mockStore.savedChats = [];
    mockStore.savedAttacks = [];
    mockStore.savedBrainstorms = [];
    mockStore.savedFactoids = [];
  });

  it('renders page title', () => {
    render(<HistoryPage />);
    expect(screen.getByText('History')).toBeDefined();
  });

  it('renders the page heading without a decorative subtitle', () => {
    render(<HistoryPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeDefined();
    expect(screen.queryByText('Access your saved prep sessions')).toBeNull();
  });

  it('renders cases tab', () => {
    render(<HistoryPage />);
    expect(screen.getByText('Cases')).toBeDefined();
  });

  it('renders chats tab', () => {
    render(<HistoryPage />);
    expect(screen.getByText('Chats')).toBeDefined();
  });

  it('renders attacks tab', () => {
    render(<HistoryPage />);
    expect(screen.getByText('Attacks')).toBeDefined();
  });

  it('renders brainstorms tab', () => {
    render(<HistoryPage />);
    expect(screen.getByText('Brainstorms')).toBeDefined();
  });

  it('renders factoids tab', () => {
    render(<HistoryPage />);
    expect(screen.getByText('Factoids')).toBeDefined();
  });

  it('shows empty state when no saved cases', () => {
    render(<HistoryPage />);
    expect(screen.getByText('No saved cases yet')).toBeDefined();
  });

  it('renders with all tabs visible', () => {
    render(<HistoryPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(6);
  });

  it('has container class', () => {
    const { container } = render(<HistoryPage />);
    expect(container.querySelector('.container')).not.toBeNull();
  });

  it('renders saved cases when present', () => {
    mockStore.savedCases = [
      { id: '1', title: 'Test Case', timestamp: Date.now(), data: {}, debateId: TEST_DEBATE_ID },
    ];
    render(<HistoryPage />);
    expect(screen.getByText('Test Case')).toBeDefined();
  });

  it('renders load button for saved cases', () => {
    mockStore.savedCases = [
      { id: '1', title: 'My Case', timestamp: Date.now(), data: {}, debateId: TEST_DEBATE_ID },
    ];
    render(<HistoryPage />);
    expect(screen.getByText('Load')).toBeDefined();
  });

  it('localizes the saved-case delete label in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    mockStore.savedCases = [{
      id: '1',
      title: 'Teszt eset',
      createdAt: Date.now(),
      data: { metadata: { side: 'pro' } },
      debateId: TEST_DEBATE_ID,
    }];

    render(<HistoryPage />);
    expect(screen.getByRole('button', { name: 'Teszt eset törlése' })).toBeInTheDocument();
  });

  it('renders heading element', () => {
    const { container } = render(<HistoryPage />);
    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe('History');
  });

  it('renders with max-w-5xl container', () => {
    const { container } = render(<HistoryPage />);
    expect(container.querySelector('.max-w-5xl')).not.toBeNull();
  });

  it('defaults to the Current Debate and never mixes in other debates', () => {
    mockStore.savedCases = [
      { id: '1', title: 'Homework case', createdAt: Date.now(), data: {}, debateId: TEST_DEBATE_ID },
      { id: '2', title: 'Zoo case', createdAt: Date.now(), data: {}, debateId: 'other-debate' },
      { id: '3', title: 'One-off case', createdAt: Date.now(), data: {}, debateId: null },
    ];
    render(<HistoryPage />);
    expect(screen.getByText('Homework case')).toBeInTheDocument();
    expect(screen.queryByText('Zoo case')).toBeNull();
    expect(screen.queryByText('One-off case')).toBeNull();
  });

  it('shows one-off and unsorted work with an exact-match suggestion when there is no current debate scope', () => {
    resetDebates();
    mockStore.savedCases = [
      { id: '3', title: 'One-off case', createdAt: Date.now(), data: {}, debateId: null },
    ];
    render(<HistoryPage />);
    expect(screen.getByText('One-off case')).toBeInTheDocument();
    expect(screen.getByText('These results are not in any debate. Nothing moves until you confirm.')).toBeInTheDocument();
  });
});
