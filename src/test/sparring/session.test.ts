import { describe, expect, it } from 'vitest';
import {
  appendSparringAiSpeech,
  completeSparringSession,
  pauseSparringTimer,
  resumeSparringTimer,
  startSparringSession,
  submitSparringSpeech,
  tickSparringTimer,
  type SparringSession,
} from '@/lib/sparring/session';
import type { SparringScorecard, SparringSpeech } from '@/lib/ai/schemas/sparring';

const START = 1_000_000;
let ids = 0;
const createId = () => `speech-${++ids}`;

function aiSpeech(session: SparringSession, turnIndex = session.currentTurnIndex): SparringSpeech {
  const turn = session.turns[turnIndex];
  return {
    id: `ai-${session.id}-${turn.id}`,
    turnId: turn.id,
    speaker: 'ai',
    side: turn.side,
    role: turn.label,
    content: 'The opponent answers.',
    createdAt: START,
    timeLimitSeconds: turn.timeLimitSeconds,
    timeUsedSeconds: 10,
  };
}

const scorecard: SparringScorecard = {
  userScore: 60,
  aiScore: 50,
  categories: [
    { name: 'Logic', userScore: 15, aiScore: 12, feedback: 'f' },
    { name: 'Evidence', userScore: 15, aiScore: 13, feedback: 'f' },
    { name: 'Delivery', userScore: 15, aiScore: 12, feedback: 'f' },
    { name: 'Strategy', userScore: 15, aiScore: 13, feedback: 'f' },
  ],
  overallFeedback: 'o',
  keyMoments: [],
  improvementAreas: [],
  winner: 'user',
  verdict: 'v',
};

describe('sparring round moves', () => {
  it('runs a Lincoln-Douglas round as Con through the opponent and student turns to judging', () => {
    let session = startSparringSession({ motion: '  A motion  ', userSide: 'con', format: 'ld', difficulty: 'medium' }, 'round-1', START);
    expect(session.motion).toBe('A motion');
    // The opponent opens, so no clock runs and the student cannot speak.
    expect(session.timerRunning).toBe(false);
    expect(submitSparringSpeech(session, 'Too early', { now: START, createId })).toBeNull();

    for (let turn = 0; turn < session.turns.length; turn += 1) {
      const speaker = session.turns[session.currentTurnIndex].speaker;
      const next = speaker === 'ai'
        ? appendSparringAiSpeech(session, aiSpeech(session), START + turn * 1000)
        : submitSparringSpeech(session, `Speech ${turn}`, { now: START + turn * 1000, createId });
      expect(next).not.toBeNull();
      session = next!;
      if (session.phase === 'round' && session.turns[session.currentTurnIndex].speaker === 'user') {
        // The student's clock starts the moment their turn begins.
        expect(session.timerRunning).toBe(true);
        expect(session.timerDeadline).toBe(START + turn * 1000 + session.turns[session.currentTurnIndex].timeLimitSeconds * 1000);
      }
    }

    expect(session.phase).toBe('judging');
    expect(session.speeches.map((speech) => speech.speaker)).toEqual(['ai', 'user', 'ai', 'user', 'ai']);
    expect(session.timerRunning).toBe(false);
    expect(appendSparringAiSpeech(session, aiSpeech(session, 4), START)).toBeNull();
    const judged = completeSparringSession(session, scorecard, START + 9000);
    expect(judged?.phase).toBe('complete');
    expect(completeSparringSession(judged!, scorecard, START)).toBeNull();
  });

  it('records an opponent speech only for its own turn, and only once', () => {
    const session = startSparringSession({ motion: 'M', userSide: 'con', format: 'pf', difficulty: 'easy' }, 'round-2', START);
    expect(appendSparringAiSpeech(session, aiSpeech(session, 2), START)).toBeNull();
    const next = appendSparringAiSpeech(session, aiSpeech(session), START)!;
    const late = { ...aiSpeech(session), id: 'another-id' };
    const back = { ...next, currentTurnIndex: 0 };
    expect(appendSparringAiSpeech(back, late, START)).toBeNull();
  });

  it('refuses a speech after the deadline, even before a tick has noticed', () => {
    const session = startSparringSession({ motion: 'M', userSide: 'pro', format: 'pf', difficulty: 'hard' }, 'round-3', START);
    const deadline = session.timerDeadline!;
    expect(submitSparringSpeech(session, 'Late', { now: deadline, createId })).toBeNull();
    expect(submitSparringSpeech(session, '   ', { now: START, createId })).toBeNull();
    expect(submitSparringSpeech(session, 'x'.repeat(6_001), { now: START, createId })).toBeNull();
    const accepted = submitSparringSpeech(session, 'On time', { now: deadline - 30_500, createId })!;
    expect(accepted.speeches[0].timeUsedSeconds).toBe(240 - 31);
  });

  it('keeps the time left across a pause and counts from the deadline after resuming', () => {
    const session = startSparringSession({ motion: 'M', userSide: 'pro', format: 'pf', difficulty: 'medium' }, 'round-4', START);
    // Within the same second the round is unchanged, so nothing re-renders.
    expect(tickSparringTimer(session, START + 400)).toBe(session);
    const paused = pauseSparringTimer(session, START + 60_200);
    expect(paused).toMatchObject({ timerRunning: false, timerDeadline: null, timerRemainingSeconds: 180 });
    expect(pauseSparringTimer(paused, START + 90_000)).toBe(paused);
    const resumed = resumeSparringTimer(paused, START + 600_000);
    expect(resumed.timerDeadline).toBe(START + 600_000 + 180_000);
    // A tick long after the deadline (the app was in the background) stops at zero.
    expect(tickSparringTimer(resumed, START + 2_000_000)).toMatchObject({ timerRemainingSeconds: 0, timerRunning: false, timerDeadline: null });
  });
});
