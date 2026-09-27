import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { SparringScorecard, SparringSpeech } from '@/lib/ai/schemas/sparring';

const { generateMock, judgeMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  judgeMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  },
}));

vi.mock('@/lib/ai/client', () => ({
  generateSparringTurn: generateMock,
  judgeSparringSession: judgeMock,
}));

const CONFIG: ProviderConfig = { provider: 'mock', model: 'local', temperature: 0.4 };

const SETTINGS = {
  outputLanguage: 'en' as const,
  getFeatureConfig: vi.fn((): ProviderConfig => CONFIG),
};

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: typeof SETTINGS) => unknown) => selector(SETTINGS),
}));

vi.mock('@/components/ModelSelector', () => ({
  ModelSelector: () => <div aria-label="Selected model">Local test model</div>,
}));

vi.mock('recharts', () => ({
  PolarAngleAxis: (): null => null,
  PolarGrid: (): null => null,
  PolarRadiusAxis: (): null => null,
  Radar: (): null => null,
  RadarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: (): null => null,
}));

import SparringPage from '@/pages/SparringPage';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { enableOneOffMode } from '@/test/helpers/debate';

const SCORECARD: SparringScorecard = {
  userScore: 78,
  aiScore: 74,
  categories: [
    { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
    { name: 'Evidence', userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
    { name: 'Delivery', userScore: 19, aiScore: 19, feedback: 'Judged from organization, not vocal performance.' },
    { name: 'Strategy', userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
  ],
  overallFeedback: 'The user won a narrow edge by weighing the main mechanism.',
  keyMoments: ['The rebuttal answered the opponent’s strongest objection.'],
  improvementAreas: ['Compare the alternative policy explicitly.'],
  winner: 'user',
  verdict: 'The user had the edge.',
};

const OPPONENT_RESPONSE = {
  action: 'respond' as const,
  speech: {
    content: 'A narrower policy could address the same concern with fewer tradeoffs.',
    strategy: 'Test the causal link and compare the alternatives.',
    targetedPoints: ['Explain why the alternative cannot solve the harm.'],
  },
};

function speech(overrides: Partial<SparringSpeech> = {}): SparringSpeech {
  return {
    id: 'speech-1',
    turnId: 'standard-1',
    speaker: 'user',
    side: 'pro',
    role: 'Pro Introductor',
    content: 'Universal access removes the direct price barrier to participation.',
    createdAt: 1_000,
    timeLimitSeconds: 240,
    timeUsedSeconds: 45,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/sparring']}>
      <SparringPage />
    </MemoryRouter>,
  );
}

describe('SparringPage', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    useSparringStore.setState({ currentSession: null, savedSessions: [], hydrated: false });
    generateMock.mockResolvedValue(OPPONENT_RESPONSE);
    judgeMock.mockResolvedValue({ action: 'score', scorecard: SCORECARD });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders setup, validates the motion, and starts a chosen round', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Sparring' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Round format' })).toHaveTextContent('School 4-6-6-3 · 8 speeches');
    expect(screen.getByText('Pro Introductor')).toBeInTheDocument();
    expect(screen.getByText('Pro Conclusor')).toBeInTheDocument();
    const motion = screen.getByLabelText('Motion');
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();

    fireEvent.change(motion, { target: { value: 'Short' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Add a little more detail');
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();

    fireEvent.change(motion, { target: { value: 'This House would make public transport free.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Con' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));

    expect(useSparringStore.getState().currentSession).toMatchObject({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      phase: 'round',
    });
    await waitFor(() => expect(screen.getByText('Round in progress')).toBeInTheDocument());
    expect(screen.getByText('Round in progress')).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('handles an AI-first round and advances to the user speech', async () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'medium',
    });
    renderPage();

    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(1));
    expect(generateMock.mock.calls[0][0]).toMatchObject({
      action: 'respond',
      sessionId: session.id,
      currentTurn: { id: 'standard-1', side: 'pro' },
    });
    expect(screen.getByRole('heading', { name: 'Your speech' })).toBeInTheDocument();
    expect(screen.getByText(OPPONENT_RESPONSE.speech.content)).toBeInTheDocument();
  });

  it('submits a user-first speech, preserves it in the transcript, and requests the response', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Motion'), { target: { value: 'This House would make public transport free.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));

    expect(screen.getByText(/Open with an exordio, define the key terms/)).toBeInTheDocument();
    const draft = screen.getByRole('textbox', { name: /Draft for Pro Introductor/i });
    fireEvent.change(draft, { target: { value: 'Universal access removes the price barrier.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));

    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    expect(useSparringStore.getState().currentSession?.speeches[0]).toMatchObject({
      speaker: 'user',
      content: 'Universal access removes the price barrier.',
    });
    expect(generateMock.mock.calls[0][0]).toMatchObject({
      action: 'respond',
      speeches: [expect.objectContaining({ speaker: 'user' })],
      currentTurn: { id: 'standard-2', side: 'con' },
    });
    expect(screen.getByText('Universal access removes the price barrier.')).toBeInTheDocument();
  });

  it('blocks a speech after the turn deadline', () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });
    useSparringStore.setState({
      currentSession: {
        ...session,
        draft: 'A speech submitted too late.',
        timerRemainingSeconds: 0,
        timerRunning: false,
        timerDeadline: null,
      },
    });

    renderPage();
    expect(screen.getByRole('button', { name: 'Submit speech' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('This speaking time has ended');
  });

  it('offers a retry after an opponent failure without duplicating the user speech', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('Temporary provider failure'))
      .mockResolvedValueOnce(OPPONENT_RESPONSE);

    renderPage();
    fireEvent.change(screen.getByLabelText('Motion'), { target: { value: 'This House would make public transport free.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'Universal access removes the price barrier.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry opponent turn' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Retry opponent turn' }));
    await waitFor(() => expect(screen.getByText(OPPONENT_RESPONSE.speech.content)).toBeInTheDocument());

    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Universal access removes the price barrier.')).toHaveLength(1);
    expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(2);
  });

  it('enters judging and renders the completed scorecard', async () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'hard',
    });
    useSparringStore.setState({
      currentSession: {
        ...session,
        speeches: [speech(), speech({ id: 'speech-2', turnId: 'standard-2', speaker: 'ai', side: 'con', role: 'Con Introductor', content: 'Targeted support costs less.', createdAt: 2_000 })],
        currentTurnIndex: session.turns.length,
        phase: 'judging',
        draft: '',
        timerRemainingSeconds: 0,
        timerRunning: false,
        timerDeadline: null,
      },
    });

    renderPage();
    expect(screen.getByText('Judge is weighing the round')).toBeInTheDocument();
    await waitFor(() => expect(judgeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useSparringStore.getState().currentSession?.phase).toBe('complete'));

    expect(screen.getByRole('heading', { name: 'Here is what happened in the room.' })).toBeInTheDocument();
    expect(screen.getByText('You won the ballot')).toBeInTheDocument();
    expect(screen.getByText('The user had the edge.')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Compare the alternative policy explicitly.')).toBeInTheDocument();
  });

  it('renders safely at a narrow viewport with reduced motion enabled', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    })));

    renderPage();
    expect(screen.getByRole('heading', { name: 'Sparring' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('Start round');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/Reconnect to start a round/)).toBeInTheDocument();
  });

  it('gates setup and draft submission while offline, then resumes online', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Motion'), { target: { value: 'This House would make public transport free.' } });

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start round' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));

    const draft = screen.getByRole('textbox', { name: /Draft for Pro Introductor/i });
    fireEvent.change(draft, { target: { value: 'Universal access removes the price barrier.' } });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit speech' })).toBeDisabled());
    fireEvent.keyDown(draft, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(0);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit speech' })).not.toBeDisabled());
    fireEvent.keyDown(draft, { key: 'Enter', code: 'Enter', ctrlKey: true });
    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(1));
  });

  it('does not request an AI-first turn until the device is online', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'medium',
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Offline. Draft saved locally.')).toBeInTheDocument());
    expect(generateMock).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    expect(generateMock.mock.calls[0][0]).toMatchObject({ sessionId: session.id, action: 'respond' });
  });

  it('does not duplicate an in-flight opponent call across connectivity events', async () => {
    let resolveOpponent!: (value: typeof OPPONENT_RESPONSE) => void;
    generateMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOpponent = resolve;
    }));
    useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'medium',
    });
    renderPage();

    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(generateMock).toHaveBeenCalledTimes(1);

    await act(async () => resolveOpponent(OPPONENT_RESPONSE));
    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(1));
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('commits an opponent response that completes while the page is unmounted', async () => {
    let resolveOpponent!: (value: typeof OPPONENT_RESPONSE) => void;
    generateMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOpponent = resolve;
    }));
    useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'medium',
    });
    const view = renderPage();
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    view.unmount();

    await act(async () => resolveOpponent(OPPONENT_RESPONSE));
    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(1));
    renderPage();

    expect(screen.getByRole('heading', { name: 'Your speech' })).toBeInTheDocument();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('does not commit an old response into a replacement session', async () => {
    let resolveOpponent!: (value: typeof OPPONENT_RESPONSE) => void;
    generateMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOpponent = resolve;
    }));
    const oldSession = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'medium',
    });
    const view = renderPage();
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    view.unmount();
    const replacement = useSparringStore.getState().startSession({
      motion: 'This House would ban private cars from city centres.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'hard',
    });

    await act(async () => resolveOpponent(OPPONENT_RESPONSE));

    expect(oldSession.id).not.toBe(replacement.id);
    expect(useSparringStore.getState().currentSession).toMatchObject({ id: replacement.id, speeches: [] });
  });
});
