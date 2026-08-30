import { describe, expect, it } from 'vitest';
import {
  canEndCrossfireSession,
  createCrossfireSetupState,
  crossfireReducer,
  expectedUserTurnKind,
} from '@/lib/crossfire/reducer';
import type { CrossfireDebrief, CrossfireState, CrossfireTurn } from '@/lib/crossfire/schemas';

function configured(mode: 'question-ai' | 'ai-questions-user' = 'question-ai'): CrossfireState {
  return {
    phase: 'setup',
    config: {
      resolution: 'Resolved: cities should ban private cars downtown.',
      argument: 'Private cars create congestion and unsafe streets.',
      mode,
      style: 'evasive',
      durationSeconds: 180,
      useSourceLibrary: false,
      seedQuestions: [],
    },
  };
}

function turn(
  sequence: number,
  speaker: 'user' | 'ai',
  kind: 'question' | 'answer',
  text = 'A bounded transcript turn.',
): CrossfireTurn {
  return { id: `T${sequence}`, sequence, speaker, kind, text, createdAt: sequence };
}

const debrief: CrossfireDebrief = {
  concessionsSecured: [],
  controlledQuestions: [{ turnIds: ['T1'], claim: 'The question fixes the comparison.' }],
  weakOrRepetitiveQuestions: [],
  evasiveOrIncompleteAnswers: [],
  missedFollowUps: [],
  betterFollowUpQuestions: [],
  strongestExchange: { turnIds: ['T1', 'T2'], claim: 'The exchange addresses the main warrant.' },
};

describe('crossfireReducer', () => {
  it('models Question the AI transitions and keeps a submitted question after failure', () => {
    let state = crossfireReducer(configured(), { type: 'session-started', sessionId: 'session-1', now: 1_000 });
    expect(state.phase).toBe('active');
    expect(expectedUserTurnKind(state)).toBe('question');

    state = crossfireReducer(state, {
      type: 'user-turn-submitted',
      turn: turn(1, 'user', 'question', 'What is the mechanism?'),
      expectedReply: 'answer',
    });
    expect(state.phase === 'active' && state.turns).toHaveLength(1);

    state = crossfireReducer(state, {
      type: 'request-failed',
      expectedReply: 'answer',
      errorKind: 'timeout',
      message: 'Timed out',
    });
    expect(state.phase === 'active' && state.request.status).toBe('failed');
    expect(state.phase === 'active' && state.turns[0].text).toBe('What is the mechanism?');

    state = crossfireReducer(state, { type: 'request-retried' });
    expect(state.phase === 'active' && state.request.status).toBe('pending');
    state = crossfireReducer(state, { type: 'ai-turn-received', turn: turn(2, 'ai', 'answer') });
    expect(expectedUserTurnKind(state)).toBe('question');
    expect(canEndCrossfireSession(state)).toBe(true);
  });

  it('models Let the AI question me and requests a new question after the user answer', () => {
    let state = crossfireReducer(configured('ai-questions-user'), {
      type: 'session-started',
      sessionId: 'session-2',
      now: 2_000,
    });
    expect(canEndCrossfireSession(state)).toBe(true);
    expect(state.phase === 'active' && state.request).toEqual({ status: 'pending', expectedReply: 'question' });
    state = crossfireReducer(state, { type: 'ai-turn-received', turn: turn(1, 'ai', 'question') });
    expect(expectedUserTurnKind(state)).toBe('answer');
    state = crossfireReducer(state, {
      type: 'user-turn-submitted',
      turn: turn(2, 'user', 'answer'),
      expectedReply: 'question',
    });
    expect(state.phase === 'active' && state.request).toEqual({ status: 'pending', expectedReply: 'question' });
    expect(state.phase === 'active' && state.turns).toHaveLength(2);
  });

  it('ends manually or on timer, retries a failed debrief, and completes', () => {
    let state = crossfireReducer(configured(), { type: 'session-started', sessionId: 'session-3', now: 1_000 });
    state = crossfireReducer(state, {
      type: 'user-turn-submitted',
      turn: turn(1, 'user', 'question'),
      expectedReply: 'answer',
    });
    state = crossfireReducer(state, { type: 'ai-turn-received', turn: turn(2, 'ai', 'answer') });
    state = crossfireReducer(state, { type: 'session-ended', now: 5_000, reason: 'timer' });
    expect(state.phase === 'debriefing' && state.endedReason).toBe('timer');
    state = crossfireReducer(state, {
      type: 'debrief-failed',
      errorKind: 'response',
      message: 'Malformed response',
    });
    expect(state.phase === 'debriefing' && state.requestStatus).toBe('failed');
    state = crossfireReducer(state, { type: 'debrief-retried' });
    state = crossfireReducer(state, { type: 'debrief-received', debrief });
    expect(state.phase).toBe('complete');
  });

  it('ignores illegal transitions and duplicate turn sequences', () => {
    const setup = createCrossfireSetupState();
    expect(crossfireReducer(setup, { type: 'ai-turn-received', turn: turn(1, 'ai', 'answer') })).toBe(setup);

    let active = crossfireReducer(configured(), { type: 'session-started', sessionId: 'session-4', now: 1 });
    const unchanged = crossfireReducer(active, { type: 'ai-turn-received', turn: turn(1, 'ai', 'answer') });
    expect(unchanged).toBe(active);

    active = crossfireReducer(active, {
      type: 'user-turn-submitted',
      turn: turn(2, 'user', 'question'),
      expectedReply: 'answer',
    });
    expect(active.phase === 'active' && active.turns).toHaveLength(0);
  });

  it('patches valid setup fields, rejects invalid patches, and resets with a prefill', () => {
    const setup = createCrossfireSetupState();
    const patched = crossfireReducer(setup, {
      type: 'config-patched',
      patch: { resolution: 'Resolved: test', argument: 'Case text', style: 'aggressive' },
    });
    expect(patched.phase === 'setup' && patched.config.style).toBe('aggressive');

    const invalid = crossfireReducer(patched, {
      type: 'config-patched',
      patch: { resolution: 'x'.repeat(501) },
    });
    expect(invalid).toBe(patched);

    const active = crossfireReducer(patched, { type: 'session-started', sessionId: 'session-5', now: 1 });
    expect(crossfireReducer(active, { type: 'config-patched', patch: { style: 'evasive' } })).toBe(active);
    const reset = crossfireReducer(active, {
      type: 'session-reset',
      prefill: { resolution: 'New resolution', argument: 'New case' },
    });
    expect(reset.phase === 'setup' && reset.config.resolution).toBe('New resolution');
  });

  it('rejects a user turn with the wrong role contract and an invalid debrief', () => {
    const active = crossfireReducer(configured(), { type: 'session-started', sessionId: 'session-6', now: 1 });
    const wrongRole = crossfireReducer(active, {
      type: 'user-turn-submitted',
      turn: turn(1, 'user', 'answer'),
      expectedReply: 'question',
    });
    expect(wrongRole).toBe(active);

    let debriefing = crossfireReducer(active, {
      type: 'user-turn-submitted',
      turn: turn(1, 'user', 'question'),
      expectedReply: 'answer',
    });
    debriefing = crossfireReducer(debriefing, { type: 'ai-turn-received', turn: turn(2, 'ai', 'answer') });
    debriefing = crossfireReducer(debriefing, { type: 'session-ended', now: 4, reason: 'manual' });
    const invalidDebrief = crossfireReducer(debriefing, {
      type: 'debrief-received',
      debrief: { ...debrief, concessionsSecured: [{ turnIds: [], claim: 'Missing reference' }] },
    });
    expect(invalidDebrief).toBe(debriefing);
  });
});
