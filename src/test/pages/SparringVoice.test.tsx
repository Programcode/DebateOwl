import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { SparringScorecard } from '@/lib/ai/schemas/sparring';

const { generateMock, judgeMock, voiceMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  judgeMock: vi.fn(),
  voiceMock: {
    speak: vi.fn(),
    stop: vi.fn(),
    unlock: vi.fn(),
    beginRound: vi.fn(),
    state: { status: 'idle', engine: null as string | null, notice: null as string | null },
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } },
}));

vi.mock('@/lib/ai/client', () => ({
  generateSparringTurn: generateMock,
  judgeSparringSession: judgeMock,
}));

vi.mock('@/lib/voice/opponent-voice', () => ({
  opponentVoice: {
    speak: voiceMock.speak,
    stop: voiceMock.stop,
    unlock: voiceMock.unlock,
    beginRound: voiceMock.beginRound,
    subscribe: () => () => {},
    getState: () => voiceMock.state,
  },
}));

const CONFIG: ProviderConfig = { provider: 'mock', model: 'local' };
const SETTINGS = { outputLanguage: 'en' as const, getFeatureConfig: vi.fn((): ProviderConfig => CONFIG) };

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
import { useVoiceAvailabilityStore } from '@/lib/voice/availability';
import { enableOneOffMode } from '@/test/helpers/debate';

class MockRecognition {
  static instances: MockRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: (event: unknown) => void = () => {};
  onerror: (event: { error: string }) => void = () => {};
  onend: () => void = () => {};
  start = vi.fn();
  stop = vi.fn(() => this.onend());
  abort = vi.fn();
  constructor() { MockRecognition.instances.push(this); }
  say(text: string) {
    this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text, confidence: 1 } }] });
  }
}

function setRecognition(value: unknown) {
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });
}

const MOTION = 'This House would make public transport free.';
const VOICE_PAYLOAD = { segments: [{ text: '[sighs] A narrower policy does the same for less.', token: 'signed-token' }] };
const OPPONENT_RESPONSE = {
  action: 'respond' as const,
  speech: { content: 'A narrower policy does the same for less.', strategy: 'Compare the alternative.', targetedPoints: ['The price barrier.'] },
  voice: VOICE_PAYLOAD,
};

const SCORECARD: SparringScorecard = {
  userScore: 78,
  aiScore: 74,
  categories: [
    { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
    { name: 'Evidence', userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
    { name: 'Delivery', userScore: 19, aiScore: 19, feedback: 'Pro Introductor ran 1:15 of 4:00 at 128 words per minute.' },
    { name: 'Strategy', userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
  ],
  overallFeedback: 'A narrow win.',
  keyMoments: ['The rebuttal.'],
  improvementAreas: ['Weigh earlier.'],
  winner: 'user',
  verdict: 'The user had the edge.',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/sparring']}>
      <SparringPage />
    </MemoryRouter>,
  );
}

async function startVoiceRound() {
  const view = renderPage();
  fireEvent.change(screen.getByLabelText('Motion'), { target: { value: MOTION } });
  fireEvent.click(screen.getByTestId('voice-mode'));
  fireEvent.click(await screen.findByRole('button', { name: 'Turn on voice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start round' }));
  await screen.findByText('Round in progress');
  return view;
}

describe('SparringPage voice rounds', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    localStorage.clear();
    MockRecognition.instances = [];
    setRecognition(MockRecognition);
    useVoiceAvailabilityStore.setState({ microphoneDenied: false, noticeAcknowledged: false });
    useSparringStore.setState({ currentSession: null, savedSessions: [], hydrated: false });
    generateMock.mockResolvedValue(OPPONENT_RESPONSE);
    judgeMock.mockResolvedValue({ action: 'score', scorecard: SCORECARD });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides voice mode with a reason where the browser cannot recognise speech, and typing still works', async () => {
    setRecognition(undefined);
    renderPage();
    expect(screen.queryByTestId('voice-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-unavailable')).toHaveTextContent('this browser has no speech recognition. Typing works as usual.');

    fireEvent.change(screen.getByLabelText('Motion'), { target: { value: MOTION } });
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));
    await screen.findByText('Round in progress');
    expect(useSparringStore.getState().currentSession).not.toHaveProperty('voice');
    expect(screen.queryByTestId('voice-mic')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'A typed speech.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    // Typed rounds do not ask for a spoken reply, and nothing is spoken.
    expect(generateMock.mock.calls[0][4]).toBe(false);
    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(2));
    expect(voiceMock.speak).not.toHaveBeenCalled();
  });

  it('hides voice mode with a reason when the microphone is blocked', () => {
    useVoiceAvailabilityStore.setState({ microphoneDenied: true });
    renderPage();
    expect(screen.queryByTestId('voice-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-unavailable')).toHaveTextContent('microphone access is blocked. Typing works as usual.');
  });

  it('says where audio and text go the first time voice is turned on, and only then', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('voice-mode'));

    const notice = await screen.findByTestId('voice-notice');
    expect(notice).toHaveTextContent('DebateLab never records or stores your audio.');
    expect(notice).toHaveTextContent('In Chrome, that sends your audio to Google');
    expect(notice).toHaveTextContent('sent as text to ElevenLabs');
    expect(screen.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'false');

    // Declining leaves voice off and the notice unacknowledged.
    fireEvent.click(within(notice).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('voice-notice')).not.toBeInTheDocument());
    expect(screen.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByTestId('voice-mode'));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on voice' }));
    expect(screen.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'true');
    // The click that turns voice on is the gesture that unlocks audio.
    expect(voiceMock.unlock).toHaveBeenCalled();

    // Off and on again: no second notice.
    fireEvent.click(screen.getByTestId('voice-mode'));
    fireEvent.click(screen.getByTestId('voice-mode'));
    expect(screen.queryByTestId('voice-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'true');
  });

  it('runs a spoken turn: words become the speech, facts are measured, and the opponent answers aloud', async () => {
    await startVoiceRound();
    expect(useSparringStore.getState().currentSession?.voice).toBe(true);

    fireEvent.click(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    const recognition = MockRecognition.instances[0];
    expect(recognition.lang).toBe('en-GB');
    // Speaking over the opponent would stop its audio first.
    expect(voiceMock.stop).toHaveBeenCalled();

    act(() => recognition.say('Um, universal access removes the price barrier'));
    act(() => recognition.say('for every rider.'));
    const draft = screen.getByRole('textbox', { name: /Draft for Pro Introductor/i });
    expect(draft).toHaveValue('Um, universal access removes the price barrier for every rider.');

    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    expect(recognition.stop).toHaveBeenCalled();

    const userSpeech = useSparringStore.getState().currentSession!.speeches[0];
    expect(userSpeech.content).toBe('Um, universal access removes the price barrier for every rider.');
    expect(userSpeech.delivery).toMatchObject({ wordCount: 10, fillerCount: 1, fillers: [{ word: 'um', count: 1 }], longPauses: 0 });

    // The request asks for a spoken reply.
    expect(generateMock.mock.calls[0][4]).toBe(true);
    await waitFor(() => expect(voiceMock.speak).toHaveBeenCalledTimes(1));
    const [utterance, onEnd] = voiceMock.speak.mock.calls[0];
    expect(utterance).toEqual({ feature: 'sparring', text: 'A narrower policy does the same for less.', voice: VOICE_PAYLOAD, language: 'en' });

    // The transcript shows and stores the reply without its audio tag.
    const aiSpeech = useSparringStore.getState().currentSession!.speeches[1];
    expect(aiSpeech.content).toBe('A narrower policy does the same for less.');
    expect(JSON.stringify(useSparringStore.getState().currentSession)).not.toContain('[sighs]');
    // The reply is in the transcript, and pinned above the composer while the user answers it.
    expect(within(screen.getByRole('region', { name: 'Transcript' })).getByText('A narrower policy does the same for less.')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Opponent’s last speech' })).getByText('A narrower policy does the same for less.')).toBeInTheDocument();
    expect(screen.queryByText(/\[sighs\]/)).not.toBeInTheDocument();

    // The student's clock waits for the opponent to finish, then runs.
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(false);
    act(() => onEnd());
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(true);
  });

  it('saves but does not speak a reply that arrives after the student left the page', async () => {
    let answer: (value: typeof OPPONENT_RESPONSE) => void = () => {};
    generateMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const view = await startVoiceRound();
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'The first speech.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));

    view.unmount();
    await act(async () => { answer(OPPONENT_RESPONSE); });

    await waitFor(() => expect(useSparringStore.getState().currentSession?.speeches).toHaveLength(2));
    expect(voiceMock.speak).not.toHaveBeenCalled();
  });

  it('gives ElevenLabs a fresh chance in each new round', async () => {
    await startVoiceRound();
    expect(voiceMock.beginRound).toHaveBeenCalledTimes(1);
  });

  it('keeps the clock paused while a later reply plays, even when an earlier reply ends under it', async () => {
    // Like the real voice: a new reply stops the one still playing, which ends it.
    let playing: (() => void) | undefined;
    voiceMock.speak.mockImplementation((_utterance: unknown, onEnd?: () => void) => {
      const previous = playing;
      playing = onEnd;
      previous?.();
    });
    await startVoiceRound();
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'The first speech.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(voiceMock.speak).toHaveBeenCalledTimes(1));
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(false);

    // The student types and sends the next speech while the first reply is still playing.
    generateMock.mockResolvedValue({ ...OPPONENT_RESPONSE, speech: { ...OPPONENT_RESPONSE.speech, content: 'A second reply.' } });
    fireEvent.change(await screen.findByRole('textbox', { name: /Draft for Pro R1/i }), { target: { value: 'The second speech.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(voiceMock.speak).toHaveBeenCalledTimes(2));

    // The first reply's end must not start the clock while the second reply plays.
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(false);
    act(() => playing?.());
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(true);
  });

  it('lets the student type in a voice round; a typed speech carries no measurements', async () => {
    await startVoiceRound();
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'A typed speech in a voice round.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    expect(useSparringStore.getState().currentSession!.speeches[0]).not.toHaveProperty('delivery');
  });

  it('does not open the microphone on the next turn when permission arrives after the speech was sent', async () => {
    let grant: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void = () => {};
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) },
    });
    try {
      await startVoiceRound();
      // The permission prompt is open; the student types and submits instead.
      fireEvent.click(screen.getByTestId('voice-mic'));
      fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'A typed speech.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
      await screen.findByRole('textbox', { name: /Draft for Pro R1/i });

      await act(async () => { grant({ getTracks: () => [{ stop: () => {} }] }); });
      expect(MockRecognition.instances).toHaveLength(0);
      expect(screen.getByTestId('voice-mic')).toHaveAttribute('aria-pressed', 'false');
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    }
  });

  it('falls back to typing with a reason when the microphone is refused mid-round', async () => {
    await startVoiceRound();
    fireEvent.click(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    act(() => MockRecognition.instances[0].onerror({ error: 'not-allowed' }));

    await waitFor(() => expect(screen.queryByTestId('voice-mic')).not.toBeInTheDocument());
    expect(screen.getByTestId('voice-unavailable')).toHaveTextContent('microphone access is blocked. Typing works as usual.');
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'Typed after the refusal.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit speech' }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    expect(generateMock.mock.calls[0][4]).toBe(false);
  });

  it('shows measured facts and the measured wording on the scorecard of a spoken round', () => {
    const session = useSparringStore.getState().startSession({ motion: MOTION, userSide: 'pro', format: 'standard', difficulty: 'medium', voice: true });
    useSparringStore.setState({
      currentSession: {
        ...session,
        phase: 'complete',
        currentTurnIndex: session.turns.length,
        scorecard: SCORECARD,
        speeches: [{
          id: 'speech-1', turnId: 'standard-1', speaker: 'user', side: 'pro', role: 'Pro Introductor',
          content: 'Um, universal access removes the price barrier.', createdAt: 1_000, timeLimitSeconds: 240, timeUsedSeconds: 80,
          delivery: { speakingSeconds: 75, wordCount: 160, wordsPerMinute: 128, fillerCount: 3, fillers: [{ word: 'um', count: 2 }, { word: 'you know', count: 1 }], longPauses: 2, longestPauseSeconds: 5 },
        }],
      },
    });
    renderPage();

    const panel = screen.getByTestId('spoken-delivery');
    expect(panel).toHaveTextContent('Spoken delivery, measured');
    expect(panel).toHaveTextContent('Nobody listened for tone, confidence or volume');
    expect(panel).toHaveTextContent('1:15 of 4:00');
    expect(panel).toHaveTextContent('128 words per minute');
    expect(panel).toHaveTextContent('3 (um × 2, you know × 1)');
    expect(panel).toHaveTextContent('Pauses of 3 seconds or more');
    expect(panel).toHaveTextContent('2 (longest 5 s)');
    expect(screen.getByText('measured, not heard')).toBeInTheDocument();
    expect(screen.queryByText('written only')).not.toBeInTheDocument();
    expect(screen.queryByText(/judged from the written speech, not audio/)).not.toBeInTheDocument();
  });

  it('keeps the written wording on the scorecard of a typed round', () => {
    const session = useSparringStore.getState().startSession({ motion: MOTION, userSide: 'pro', format: 'standard', difficulty: 'medium' });
    useSparringStore.setState({
      currentSession: {
        ...session,
        phase: 'complete',
        currentTurnIndex: session.turns.length,
        scorecard: SCORECARD,
        speeches: [{
          id: 'speech-1', turnId: 'standard-1', speaker: 'user', side: 'pro', role: 'Pro Introductor',
          content: 'Universal access removes the price barrier.', createdAt: 1_000, timeLimitSeconds: 240, timeUsedSeconds: 80,
        }],
      },
    });
    renderPage();
    expect(screen.queryByTestId('spoken-delivery')).not.toBeInTheDocument();
    expect(screen.getByText('written only')).toBeInTheDocument();
    expect(screen.getByText('Specific reasons behind every score. Delivery is judged from the written speech, not audio.')).toBeInTheDocument();
  });
});
