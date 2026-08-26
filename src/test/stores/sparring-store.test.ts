import { beforeEach, describe, expect, it } from 'vitest';
import { useSparringStore } from '@/lib/stores/sparring-store';
import type { SparringScorecard } from '@/lib/ai/schemas/sparring';

const scorecard: SparringScorecard = {
  verdict: 'close',
  summary: 'Both sides created offense, but the comparison remained underdeveloped.',
  biggestImprovement: 'Compare probability before introducing another argument.',
  strengths: ['The opening had a clear causal warrant.'],
  missedArguments: ['The rebuttal did not answer the opponent impact.'],
  categories: [
    { category: 'argument-strength', rating: 'strong', evidence: 'The opening linked the policy to the stated harm.', advice: 'Keep the same causal structure.' },
    { category: 'warrant-quality', rating: 'solid', evidence: 'The second link was asserted more than explained.', advice: 'Explain the mechanism explicitly.' },
    { category: 'engagement', rating: 'solid', evidence: 'The rebuttal answered the opponent claim but not its impact.', advice: 'Answer offense all the way through impact.' },
    { category: 'weighing', rating: 'needs-work', evidence: 'No direct magnitude or probability comparison appeared.', advice: 'End rebuttal with a comparative weighing sentence.' },
  ],
  nextDrill: 'Give a 60-second rebuttal that contains one explicit probability comparison.',
};

describe('sparring-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useSparringStore.setState({ sessions: [], activeSessionId: null });
  });

  it('starts a session and makes it active', () => {
    const session = useSparringStore.getState().startSession({
      motion: 'This House would ban targeted advertising to minors.',
      side: 'pro',
      difficulty: 'competitive',
      useActiveSources: true,
    });

    const state = useSparringStore.getState();
    expect(state.activeSessionId).toBe(session.id);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].status).toBe('active');
  });

  it('records turns and completes the scorecard', () => {
    const store = useSparringStore.getState();
    const session = store.startSession({
      motion: 'This House would require social media platforms to verify user age.',
      side: 'con',
      difficulty: 'brutal',
      useActiveSources: true,
    });

    store.addTurn(session.id, { role: 'user', phase: 'opening', content: 'Age verification creates privacy risks because identity data becomes centralized.' });
    store.addTurn(session.id, { role: 'ai', phase: 'opening', content: 'The policy can use privacy-preserving verification and reduces exposure to harmful content.' });
    store.completeSession(session.id, scorecard);

    const saved = useSparringStore.getState().sessions[0];
    expect(saved.turns).toHaveLength(2);
    expect(saved.status).toBe('complete');
    expect(saved.scorecard?.biggestImprovement).toContain('Compare probability');
  });

  it('deletes a session and clears the active id', () => {
    const store = useSparringStore.getState();
    const session = store.startSession({
      motion: 'This House supports mandatory voting in national elections.',
      side: 'pro',
      difficulty: 'beginner',
      useActiveSources: true,
    });

    store.deleteSession(session.id);
    expect(useSparringStore.getState().sessions).toHaveLength(0);
    expect(useSparringStore.getState().activeSessionId).toBeNull();
  });

  it('clears all local sparring history at an auth boundary', () => {
    const store = useSparringStore.getState();
    store.startSession({
      motion: 'This House would require open primaries in national elections.',
      side: 'con',
      difficulty: 'competitive',
      useActiveSources: true,
    });

    store.clearSparringHistory();
    expect(useSparringStore.getState().sessions).toEqual([]);
    expect(useSparringStore.getState().activeSessionId).toBeNull();
  });

  it('caps persisted history to thirty sessions', () => {
    const store = useSparringStore.getState();
    for (let index = 0; index < 35; index += 1) {
      store.startSession({
        motion: `This House would adopt policy number ${index} for public debate practice.`,
        side: index % 2 === 0 ? 'pro' : 'con',
        difficulty: 'competitive',
        useActiveSources: true,
      });
    }

    expect(useSparringStore.getState().sessions).toHaveLength(30);
  });

  it('drops malformed localStorage sessions instead of trusting persisted data', async () => {
    localStorage.setItem('debatelab-sparring', JSON.stringify({
      state: {
        sessions: [{ id: 'broken', setup: { motion: 42 }, turns: 'not-an-array' }],
        activeSessionId: 'broken',
      },
      version: 0,
    }));

    await useSparringStore.persist.rehydrate();

    expect(useSparringStore.getState().sessions).toEqual([]);
    expect(useSparringStore.getState().activeSessionId).toBeNull();
  });
});
