import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock, resetMockState, setMockTableResponse } from '../mocks/supabase';
import { useSparringStore, type SparringSession } from '@/lib/stores/sparring-store';
import type { SparringScorecard, SparringSpeech } from '@/lib/ai/schemas/sparring';

const { captureProductEventMock } = vi.hoisted(() => ({
  captureProductEventMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/observability', () => ({
  captureProductEvent: captureProductEventMock,
}));

const SCORECARD: SparringScorecard = {
  userScore: 76,
  aiScore: 72,
  categories: [
    { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The central causal chain was clear.' },
    { name: 'Evidence', userScore: 18, aiScore: 17, feedback: 'The round needed one stronger factual warrant.' },
    { name: 'Delivery', userScore: 19, aiScore: 18, feedback: 'Typed delivery was not inferred; organization was readable.' },
    { name: 'Strategy', userScore: 19, aiScore: 19, feedback: 'Both sides engaged the main clash.' },
  ],
  overallFeedback: 'A close round with a small advantage to the user.',
  keyMoments: ['The final rebuttal answered the strongest objection.'],
  improvementAreas: ['Add comparative weighing before the conclusion.'],
  winner: 'user',
  verdict: 'The user had a narrow edge.',
};

function getSession(): SparringSession {
  const session = useSparringStore.getState().currentSession;
  if (!session) throw new Error('Expected an active sparring session.');
  return session;
}

function speech(overrides: Partial<SparringSpeech> = {}): SparringSpeech {
  return {
    id: 'ai-speech-1',
    turnId: 'standard-2',
    speaker: 'ai',
    side: 'con',
    role: 'Con Introductor',
    content: 'A narrower policy could address the same concern with fewer tradeoffs.',
    createdAt: 2_000,
    timeLimitSeconds: 240,
    timeUsedSeconds: 120,
    ...overrides,
  };
}

function validSavedRow(id: string) {
  return {
    id,
    motion: 'This House would make public transport free at the point of use.',
    user_side: 'pro',
    format: 'standard',
    difficulty: 'medium',
    turns: [
      {
        id: 'user-speech-1',
        turnId: 'standard-1',
        speaker: 'user',
        side: 'pro',
        role: 'Pro Introductor',
        content: 'Universal access removes a direct barrier to participation.',
        createdAt: 1_000,
        timeLimitSeconds: 240,
        timeUsedSeconds: 80,
      },
      speech(),
    ],
    final_evaluation: SCORECARD,
    status: 'complete',
    created_at: '2026-08-30T00:00:00.000Z',
    updated_at: '2026-08-30T00:02:00.000Z',
  };
}

describe('sparring-store', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    resetMockState();
    captureProductEventMock.mockClear();
    useSparringStore.setState({ ownerUserId: null, currentSession: null, privateSessionBackup: null, savedSessions: [], hydrated: false });
  });

  it('starts a session with a live user timer and preserves the draft without writing on every keystroke', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const session = useSparringStore.getState().startSession({
      motion: '  This House would make public transport free.  ',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    expect(session.motion).toBe('This House would make public transport free.');
    expect(session.currentTurnIndex).toBe(0);
    expect(session.turns[0].speaker).toBe('user');
    expect(session.turns[0]).toMatchObject({ label: 'Pro Introductor', kind: 'introductor', timeLimitSeconds: 240 });
    expect(session.timerRemainingSeconds).toBe(240);
    expect(session.timerRunning).toBe(true);
    expect(session.timerDeadline).toBe(241_000);

    useSparringStore.getState().setDraft('My opening claim and warrant.');
    expect(getSession().draft).toBe('My opening claim and warrant.');
    const beforeDebounce = JSON.parse(sessionStorage.getItem('debate-sparring-storage') ?? '{}') as {
      state?: { currentSession?: { draft?: string } };
    };
    expect(beforeDebounce.state?.currentSession?.draft).toBe('');
    vi.advanceTimersByTime(250);

    const persisted = JSON.parse(sessionStorage.getItem('debate-sparring-storage') ?? '{}') as {
      state?: { currentSession?: { draft?: string } };
    };
    expect(persisted.state?.currentSession?.draft).toBe('My opening claim and warrant.');
  });

  it('keeps a private draft while a workspace session runs', () => {
    const privateSession = useSparringStore.getState().startSession({
      motion: 'Private motion',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    useSparringStore.getState().beginWorkspaceSession();
    expect(useSparringStore.getState()).toMatchObject({ currentSession: null, privateSessionBackup: { id: privateSession.id } });
    useSparringStore.getState().startSession({
      motion: 'Workspace motion',
      userSide: 'con',
      format: 'ld',
      difficulty: 'hard',
    });
    useSparringStore.getState().endWorkspaceSession();

    expect(useSparringStore.getState().currentSession?.id).toBe(privateSession.id);
    expect(useSparringStore.getState().privateSessionBackup).toBeNull();
  });

  it('restores and abandons a persisted workspace session safely', () => {
    const session = useSparringStore.getState().startSession({
      motion: 'Workspace motion',
      userSide: 'con',
      format: 'ld',
      difficulty: 'hard',
    });
    useSparringStore.setState({ currentSession: null });

    expect(useSparringStore.getState().restoreWorkspaceSession(session)).toBe(true);
    expect(getSession()).toMatchObject({ id: session.id, motion: 'Workspace motion' });
    useSparringStore.getState().abandonSession();
    expect(useSparringStore.getState().currentSession).toBeNull();
    expect(useSparringStore.getState().restoreWorkspaceSession({ id: 'invalid' })).toBe(false);
  });

  it('migrates an in-progress legacy standard round to the school roles', async () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });
    useSparringStore.setState({ currentSession: null, savedSessions: [] });
    sessionStorage.setItem('debate-sparring-storage', JSON.stringify({
      version: 1,
      state: {
        currentSession: {
          ...session,
          turns: session.turns.map((turn, index) => ({
            ...turn,
            label: index < 2 ? `${turn.side === 'pro' ? 'Pro' : 'Con'} opening` : turn.label,
            kind: index < 2 ? 'opening' : index < 4 ? 'constructive' : index < 6 ? 'rebuttal' : 'final',
          })),
        },
        savedSessions: [],
      },
    }));
    await useSparringStore.persist.rehydrate();

    expect(getSession().turns.map(({ label, kind }) => ({ label, kind }))).toEqual([
      { label: 'Pro Introductor', kind: 'introductor' },
      { label: 'Con Introductor', kind: 'introductor' },
      { label: 'Pro R1', kind: 'r1' },
      { label: 'Con R1', kind: 'r1' },
      { label: 'Pro R2', kind: 'r2' },
      { label: 'Con R2', kind: 'r2' },
      { label: 'Pro Conclusor', kind: 'conclusor' },
      { label: 'Con Conclusor', kind: 'conclusor' },
    ]);
  });

  it('rejects malformed persisted state even at the current storage version', async () => {
    sessionStorage.setItem('debate-sparring-storage', JSON.stringify({
      version: 3,
      state: {
        currentSession: { id: 'malformed', turns: 'not-an-array' },
        savedSessions: [{ id: 'also-malformed' }],
      },
    }));

    await useSparringStore.persist.rehydrate();

    expect(useSparringStore.getState()).toMatchObject({ currentSession: null, savedSessions: [] });
  });

  it('clears unowned or cross-user state before hydrating a signed-in user', () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });
    useSparringStore.setState({ savedSessions: [session] });

    useSparringStore.getState().prepareForUser('user-a');
    expect(useSparringStore.getState()).toMatchObject({ ownerUserId: 'user-a', currentSession: null, savedSessions: [], hydrated: false });

    const ownedSession = useSparringStore.getState().startSession({
      motion: 'This House supports protected bike lanes.',
      userSide: 'con',
      format: 'ld',
      difficulty: 'hard',
    });
    useSparringStore.getState().prepareForUser('user-a');
    expect(useSparringStore.getState().currentSession?.id).toBe(ownedSession.id);

    useSparringStore.getState().prepareForUser('user-b');
    expect(useSparringStore.getState()).toMatchObject({ ownerUserId: 'user-b', currentSession: null, savedSessions: [], hydrated: false });
  });

  it('pauses, resumes, and times out against a wall-clock deadline', () => {
    vi.setSystemTime(1_000);
    useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    useSparringStore.getState().pauseTimer(61_000);
    expect(getSession()).toMatchObject({
      timerRemainingSeconds: 180,
      timerRunning: false,
      timerDeadline: null,
    });

    useSparringStore.getState().resumeTimer(70_000);
    expect(getSession()).toMatchObject({
      timerRemainingSeconds: 180,
      timerRunning: true,
      timerDeadline: 250_000,
    });

    useSparringStore.getState().tickTimer(250_001);
    expect(getSession()).toMatchObject({
      timerRemainingSeconds: 0,
      timerRunning: false,
      timerDeadline: null,
    });
  });

  it('records each turn in order and rejects an out-of-order or duplicate AI speech', () => {
    vi.setSystemTime(1_000);
    const store = useSparringStore.getState();
    store.startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    const afterUser = store.submitUserSpeech('Universal access removes the price barrier.', 61_000);
    expect(afterUser?.speeches).toHaveLength(1);
    expect(afterUser?.speeches[0]).toMatchObject({
      turnId: 'standard-1',
      speaker: 'user',
      side: 'pro',
      content: 'Universal access removes the price barrier.',
      timeUsedSeconds: 60,
    });

    expect(store.appendAiSpeech(speech({ turnId: 'standard-8' }), 62_000)).toBeNull();
    expect(getSession().speeches).toHaveLength(1);

    const opponentSpeech = speech();
    const afterAi = store.appendAiSpeech(opponentSpeech, 62_000);
    expect(afterAi?.speeches).toHaveLength(2);
    expect(afterAi?.currentTurnIndex).toBe(2);
    expect(afterAi?.turns[2].speaker).toBe('user');

    // Simulate a stale in-flight response arriving while the same AI turn is
    // still active. The store must not append it a second time.
    const activeAiSession = {
      ...getSession(),
      currentTurnIndex: 1,
      speeches: [afterAi?.speeches[0] ?? opponentSpeech, opponentSpeech],
    };
    useSparringStore.setState({ currentSession: activeAiSession });
    expect(store.appendAiSpeech(opponentSpeech, 63_000)).toBeNull();
    expect(getSession().speeches.filter((item) => item.id === opponentSpeech.id)).toHaveLength(1);
  });

  it('captures the zero-based final turn index when the round enters judging', () => {
    const store = useSparringStore.getState();
    const session = store.startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });
    const finalTurnIndex = session.turns.length - 1;
    useSparringStore.setState({
      currentSession: {
        ...session,
        currentTurnIndex: finalTurnIndex,
        timerRemainingSeconds: session.turns[finalTurnIndex].timeLimitSeconds,
        timerRunning: false,
        timerDeadline: null,
      },
    });

    const completedRound = store.appendAiSpeech(speech({
      id: 'ai-final-speech',
      turnId: session.turns[finalTurnIndex].id,
      role: session.turns[finalTurnIndex].label,
      timeLimitSeconds: session.turns[finalTurnIndex].timeLimitSeconds,
    }), 10_000);

    expect(completedRound?.phase).toBe('judging');
    // The store's currentTurnIndex is zero-based, so the final standard turn is index 7.
    expect(captureProductEventMock).toHaveBeenCalledWith('sparring_round_completed', {
      format: 'standard',
      roundIndex: finalTurnIndex,
    });

    expect(store.appendAiSpeech(speech({
      id: 'ai-final-retry',
      turnId: session.turns[finalTurnIndex].id,
    }), 11_000)).toBeNull();
    expect(captureProductEventMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a speech that exceeds the server content limit without advancing', () => {
    const store = useSparringStore.getState();
    store.startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    expect(store.submitUserSpeech('x'.repeat(6_001))).toBeNull();
    expect(getSession()).toMatchObject({ currentTurnIndex: 0, speeches: [] });
  });

  it('rejects a speech after its saved deadline without advancing', () => {
    const store = useSparringStore.getState();
    store.startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'medium',
    });

    const deadline = getSession().timerDeadline;
    if (deadline === null) throw new Error('Expected a running timer.');
    expect(store.submitUserSpeech('A late speech.', deadline + 1)).toBeNull();
    expect(getSession()).toMatchObject({ currentTurnIndex: 0, speeches: [] });
  });

  it('moves to judging and saves a completed scorecard', () => {
    const store = useSparringStore.getState();
    const session = store.startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'ld',
      difficulty: 'hard',
    });
    useSparringStore.setState({
      currentSession: {
        ...session,
        currentTurnIndex: session.turns.length,
        phase: 'judging',
        timerRemainingSeconds: 0,
        timerRunning: false,
        timerDeadline: null,
      },
    });

    const completed = store.completeSession(SCORECARD, 10_000);
    expect(completed?.phase).toBe('complete');
    expect(completed?.scorecard).toEqual(SCORECARD);
    expect(useSparringStore.getState().savedSessions).toEqual([completed]);
    expect(captureProductEventMock).toHaveBeenCalledWith('sparring_session_judged', {
      format: 'ld',
      winner: 'user',
      speechCount: 0,
    });

    expect(store.completeSession(SCORECARD, 11_000)).toBeNull();
    expect(captureProductEventMock).toHaveBeenCalledTimes(1);
  });

  it('hydrates only complete rows that pass the nested speech and scorecard schemas', async () => {
    setMockTableResponse('sparring_sessions', {
      select: [
        validSavedRow('valid-row'),
        { ...validSavedRow('bad-speech'), turns: [{ ...speech(), content: 42 }] },
        { ...validSavedRow('bad-scorecard'), final_evaluation: { ...SCORECARD, categories: [] } },
        { ...validSavedRow('in-progress'), status: 'in_progress' },
      ],
    });

    await useSparringStore.getState().hydrateSavedSessions();

    expect(useSparringStore.getState().savedSessions).toHaveLength(1);
    expect(useSparringStore.getState().savedSessions[0].id).toBe('valid-row');
    expect(useSparringStore.getState().savedSessions[0].phase).toBe('complete');
    expect(useSparringStore.getState().hydrated).toBe(true);
  });

  it('caps hydrated sparring history to fifty sessions', async () => {
    setMockTableResponse('sparring_sessions', {
      select: Array.from({ length: 55 }, (_, index) => ({
        ...validSavedRow(`saved-row-${index}`),
        updated_at: new Date(Date.UTC(2026, 7, 30, 0, index)).toISOString(),
      })),
    });

    await useSparringStore.getState().hydrateSavedSessions();

    expect(useSparringStore.getState().savedSessions).toHaveLength(50);
    expect(useSparringStore.getState().savedSessions[0].id).toBe('saved-row-54');
  });

  it('discards a hydration response after local auth data is reset', async () => {
    let finishQuery!: (value: { data: unknown[]; error: null }) => void;
    supabaseMock.from.mockImplementationOnce(() => ({
      select: () => ({
        order: () => new Promise((resolve) => {
          finishQuery = resolve;
        }),
      }),
    } as ReturnType<typeof supabaseMock.from>));

    const hydration = useSparringStore.getState().hydrateSavedSessions();
    await vi.waitFor(() => expect(supabaseMock.from).toHaveBeenCalledWith('sparring_sessions'));
    useSparringStore.getState().resetLocalData();
    finishQuery({ data: [validSavedRow('stale-user-row')], error: null });
    await hydration;

    expect(useSparringStore.getState()).toMatchObject({ savedSessions: [], hydrated: false });
  });

  it('rolls back the local deletion when the server delete fails', async () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would make public transport free.',
      userSide: 'pro',
      format: 'standard',
      difficulty: 'easy',
    });
    useSparringStore.setState({
      savedSessions: [{
        ...session,
        phase: 'complete',
        currentTurnIndex: session.turns.length,
        scorecard: SCORECARD,
        timerRemainingSeconds: 0,
        timerRunning: false,
        timerDeadline: null,
      }],
    });

    supabaseMock.from.mockImplementationOnce(() => ({
      delete: () => ({
        eq: async () => ({ data: null, error: { message: 'delete unavailable' } }),
      }),
    } as ReturnType<typeof supabaseMock.from>));

    await expect(useSparringStore.getState().deleteSavedSession(session.id))
      .rejects.toThrow('delete unavailable');
    expect(useSparringStore.getState().savedSessions).toHaveLength(1);
    expect(useSparringStore.getState().savedSessions[0].id).toBe(session.id);
  });
});
