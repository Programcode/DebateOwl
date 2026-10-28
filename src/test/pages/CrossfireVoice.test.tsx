import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  crossfire: vi.fn<(input: unknown, config: unknown, options: { voice?: boolean }) => Promise<unknown>>(),
  crossfireSignal: vi.fn(() => Promise.resolve(undefined)),
  voice: {
    speak: vi.fn(),
    stop: vi.fn(),
    unlock: vi.fn(),
    beginRound: vi.fn(),
    state: { status: 'idle', engine: null as string | null, notice: null as string | null },
  },
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: { sourceLibrary: unknown[] }) => unknown) => selector({ sourceLibrary: [] }),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: () => ({
    getFeatureConfig: () => ({ provider: 'google', model: 'gemini-3-flash-preview' }),
    outputLanguage: 'es',
  }),
}));

vi.mock('@/lib/ai/client', () => ({
  AIResponseError: class AIResponseError extends Error {},
  crossfire: mocks.crossfire,
  crossfireSignal: mocks.crossfireSignal,
  isTimeoutError: () => false,
  isAISubscriptionError: () => false,
  isAIModelRestrictionError: () => false,
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ remainingToday: null as number | null, dailyLimit: 5 }),
}));

vi.mock('@/hooks/use-session-quota', () => ({
  useSessionQuota: () => ({ units: null as number | null, remaining: null as number | null, blocked: null as string | null, checkBeforeStart: async (): Promise<null> => null }),
}));

vi.mock('@/lib/voice/opponent-voice', () => ({
  opponentVoice: {
    speak: mocks.voice.speak,
    stop: mocks.voice.stop,
    unlock: mocks.voice.unlock,
    beginRound: mocks.voice.beginRound,
    subscribe: () => () => {},
    getState: () => mocks.voice.state,
  },
}));

import CrossfirePage from '@/pages/CrossfirePage';
import { loadCrossfireDraft } from '@/lib/crossfire/storage';
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
  /** Like Chrome: the last words arrive after stop(), then the session ends. */
  stop = vi.fn(() => {
    if (this.pendingOnStop) this.say(this.pendingOnStop);
    this.onend();
  });
  abort = vi.fn();
  pendingOnStop = '';
  constructor() { MockRecognition.instances.push(this); }
  say(text: string) {
    this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text, confidence: 1 } }] });
  }
}

function setRecognition(value: unknown) {
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });
}

const DEBRIEF = {
  concessionsSecured: [] as unknown[],
  controlledQuestions: [{ turnIds: ['T1'], claim: 'The question fixes the comparison.' }],
  weakOrRepetitiveQuestions: [] as unknown[],
  evasiveOrIncompleteAnswers: [] as unknown[],
  missedFollowUps: [] as unknown[],
  betterFollowUpQuestions: [] as unknown[],
  strongestExchange: null as unknown,
};
const VOICE_PAYLOAD = { segments: [{ text: '[scoffs] El coste recae en quien no viaja.', token: 'signed-token' }] };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/crossfire']}>
      <CrossfirePage />
    </MemoryRouter>,
  );
}

function fillSetup() {
  fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
  fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
}

/** Start checks today's quota first, so the round opens a moment after the click. */
async function clickStart() {
  fireEvent.click(screen.getByTestId('start-crossfire'));
  await screen.findByTestId('end-crossfire');
}

describe('CrossfirePage voice rounds', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.clearAllMocks();
    mocks.crossfire.mockImplementation(() => new Promise(() => undefined));
    localStorage.clear();
    MockRecognition.instances = [];
    setRecognition(MockRecognition);
    // The first-use notice has its own test on the Sparring page.
    useVoiceAvailabilityStore.setState({ microphoneDenied: false, noticeAcknowledged: true });
  });

  it('hides voice mode with a reason where it cannot work, and typed rounds are unchanged', async () => {
    setRecognition(undefined);
    mocks.crossfire.mockResolvedValueOnce({ type: 'answer', text: 'A typed answer.' });
    renderPage();
    expect(screen.queryByTestId('voice-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-unavailable')).toHaveTextContent('Typing works as usual.');

    fillSetup();
    await clickStart();
    expect(screen.queryByTestId('voice-mic')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(await screen.findByText('A typed answer.')).toBeInTheDocument();
    expect(mocks.crossfire.mock.calls[0][2].voice).toBe(false);
    expect(mocks.voice.speak).not.toHaveBeenCalled();
  });

  it('runs a spoken exchange: the question is spoken, the reply is heard, and no tag is shown or saved', async () => {
    mocks.crossfire.mockResolvedValueOnce({ type: 'answer', text: 'El coste recae en quien no viaja.', voice: VOICE_PAYLOAD });
    renderPage();
    fillSetup();
    fireEvent.click(screen.getByTestId('voice-mode'));
    expect(screen.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'true');
    await clickStart();
    // Each new round gives ElevenLabs a fresh chance.
    expect(mocks.voice.beginRound).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    const recognition = MockRecognition.instances[0];
    // The round is spoken in the AI-output language.
    expect(recognition.lang).toBe('es-ES');
    act(() => recognition.say('Pues, ¿quién paga'));
    expect(screen.getByTestId('crossfire-input')).toHaveValue('Pues, ¿quién paga');

    // Sending while still listening waits for the last words.
    recognition.pendingOnStop = 'los autobuses?';
    fireEvent.click(screen.getByTestId('submit-turn'));
    await waitFor(() => expect(mocks.crossfire).toHaveBeenCalledTimes(1));
    const [input, , options] = mocks.crossfire.mock.calls[0] as [{ transcript: Array<Record<string, unknown>> }, unknown, { voice?: boolean }];
    expect(options.voice).toBe(true);
    expect(input.transcript[0].text).toBe('Pues, ¿quién paga los autobuses?');
    expect(input.transcript[0].delivery).toMatchObject({ wordCount: 5, fillerCount: 1, fillers: [{ word: 'pues', count: 1 }] });

    expect(await screen.findByText('El coste recae en quien no viaja.')).toBeInTheDocument();
    await waitFor(() => expect(mocks.voice.speak).toHaveBeenCalledTimes(1));
    expect(mocks.voice.speak.mock.calls[0][0]).toEqual({
      feature: 'crossfire',
      text: 'El coste recae en quien no viaja.',
      voice: VOICE_PAYLOAD,
      language: 'es',
    });
    expect(screen.queryByText(/\[scoffs\]/)).not.toBeInTheDocument();
    // The saved draft keeps the round's mode and measurements, and no tag.
    const saved = JSON.stringify(loadCrossfireDraft('user-a', window.localStorage));
    expect(saved).toContain('"voice":true');
    expect(saved).toContain('"wordsPerMinute"');
    expect(saved).not.toContain('[scoffs]');
  });

  it('lets the AI open a spoken round and summarises the measured facts in the debrief', async () => {
    mocks.crossfire
      .mockResolvedValueOnce({ type: 'question', text: '¿Quién paga los autobuses?' })
      .mockResolvedValueOnce({ type: 'question', text: '¿Y si el dinero no alcanza?' })
      .mockResolvedValueOnce(DEBRIEF);
    renderPage();
    fillSetup();
    fireEvent.click(screen.getByTestId('mode-ai-questions-user'));
    fireEvent.click(screen.getByTestId('voice-mode'));
    await clickStart();

    // With no segments from the server, the browser voice still reads the clean text.
    await waitFor(() => expect(mocks.voice.speak).toHaveBeenCalledTimes(1));
    expect(mocks.voice.speak.mock.calls[0][0]).toEqual({ feature: 'crossfire', text: '¿Quién paga los autobuses?', voice: undefined, language: 'es' });

    fireEvent.click(await screen.findByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    // Starting to speak ends the opponent's audio.
    expect(mocks.voice.stop).toHaveBeenCalled();
    act(() => MockRecognition.instances[0].say('Eh, lo paga el presupuesto municipal, o sea, todos.'));
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(await screen.findByText('¿Y si el dinero no alcanza?')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('end-crossfire'));
    const panel = await screen.findByTestId('spoken-delivery');
    expect(panel).toHaveTextContent('Spoken delivery, measured');
    expect(panel).toHaveTextContent('Nobody listened for tone, confidence or volume');
    expect(panel).toHaveTextContent('2 (eh × 1, o sea × 1)');
    // The debrief request itself is never a voice request.
    expect(mocks.crossfire.mock.calls[2][2].voice).toBeUndefined();
  });

  it('shows no measured panel after a typed round', async () => {
    mocks.crossfire
      .mockResolvedValueOnce({ type: 'answer', text: 'A typed answer.' })
      .mockResolvedValueOnce(DEBRIEF);
    renderPage();
    fillSetup();
    await clickStart();
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    await screen.findByText('A typed answer.');
    fireEvent.click(screen.getByTestId('end-crossfire'));
    await screen.findByTestId('crossfire-debrief');
    expect(screen.queryByTestId('spoken-delivery')).not.toBeInTheDocument();
  });

  it('does not carry words spoken in one round into the measurements of the next', async () => {
    mocks.crossfire.mockResolvedValue({ type: 'answer', text: 'An answer.' });
    renderPage();
    fillSetup();
    fireEvent.click(screen.getByTestId('voice-mode'));
    await clickStart();

    // Spoken, never sent: the student leaves the round instead.
    fireEvent.click(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    act(() => MockRecognition.instances[0].say('Um, a question from the abandoned round'));
    fireEvent.click(screen.getByTestId('end-crossfire'));

    // A new voice round on the same page, with a typed turn.
    fillSetup();
    fireEvent.click(screen.getByTestId('voice-mode'));
    await clickStart();
    // An unsent draft stays in the box, as it does in a typed round. The student replaces it.
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'A new typed question?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    await waitFor(() => expect(mocks.crossfire).toHaveBeenCalledTimes(1));
    const [input] = mocks.crossfire.mock.calls[0] as unknown as [{ transcript: Array<Record<string, unknown>> }];
    expect(input.transcript[0].text).toBe('A new typed question?');
    expect(input.transcript[0]).not.toHaveProperty('delivery');
  });

  it('does not open the microphone on the next turn when permission arrives after the turn was sent', async () => {
    let grant: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void = () => {};
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) },
    });
    try {
      mocks.crossfire.mockResolvedValueOnce({ type: 'answer', text: 'First answer.' });
      renderPage();
      fillSetup();
      fireEvent.click(screen.getByTestId('voice-mode'));
      await clickStart();

      // The permission prompt is open; the student types and sends instead.
      fireEvent.click(screen.getByTestId('voice-mic'));
      fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'A typed question?' } });
      fireEvent.click(screen.getByTestId('submit-turn'));
      await screen.findByText('First answer.');

      await act(async () => { grant({ getTracks: () => [{ stop: () => {} }] }); });
      expect(MockRecognition.instances).toHaveLength(0);
      expect(screen.getByTestId('voice-mic')).toHaveAttribute('aria-pressed', 'false');
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    }
  });

  it('falls back to typing with a reason when the microphone is refused mid-round', async () => {
    mocks.crossfire.mockResolvedValueOnce({ type: 'answer', text: 'A typed answer.' });
    renderPage();
    fillSetup();
    fireEvent.click(screen.getByTestId('voice-mode'));
    await clickStart();
    fireEvent.click(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(MockRecognition.instances).toHaveLength(1));
    act(() => MockRecognition.instances[0].onerror({ error: 'not-allowed' }));

    await waitFor(() => expect(screen.queryByTestId('voice-mic')).not.toBeInTheDocument());
    expect(screen.getByTestId('voice-unavailable')).toHaveTextContent('microphone access is blocked. Typing works as usual.');
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'Typed after the refusal?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(await screen.findByText('A typed answer.')).toBeInTheDocument();
    expect(mocks.crossfire.mock.calls[0][2].voice).toBe(false);
  });
});
