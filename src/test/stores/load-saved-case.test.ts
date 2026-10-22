import { beforeEach, describe, expect, it } from 'vitest';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { useSessionStore } from '@/lib/stores/session-store';

const loaded = {
  caseStructure: { thesis: 'Loaded thesis', framework: '', keyDefinitions: [] as string[], burdenOfProof: '' },
  contentions: [] as GenerateOutput['contentions'],
  predictedOpponentCase: {
    likelyArguments: [] as string[],
    strategicWeaknesses: [] as string[],
    keyClashes: [] as string[],
  },
  counters: [] as GenerateOutput['counters'],
  metadata: { side: 'con' as const, format: 'custom', motion: 'Loaded motion', generatedAt: '2026-01-01T00:00:00Z' },
} satisfies GenerateOutput;

describe('loading a saved case', () => {
  beforeEach(() => {
    useSessionStore.getState().resetLocalData();
  });

  it('restores the case motion and the debate it belongs to', () => {
    useSessionStore.setState({
      generateForm: { motion: 'Whatever I was typing', side: 'pro' },
      savedCases: [{ id: 'case-1', title: 'Loaded motion', createdAt: 1, debateId: 'debate-b', data: loaded }],
    });

    useSessionStore.getState().loadSavedCase('case-1');

    const state = useSessionStore.getState();
    expect(state.generateResult).toBe(loaded);
    expect(state.generateResultDebateId).toBe('debate-b');
    expect(state.generateForm.motion).toBe('Loaded motion');
    expect(state.generateForm.side).toBe('con');
  });

  it('marks a case with no debate as one-off', () => {
    useSessionStore.setState({
      savedCases: [{ id: 'case-1', title: 'One-off', createdAt: 1, data: loaded }],
    });

    useSessionStore.getState().loadSavedCase('case-1');

    expect(useSessionStore.getState().generateResultDebateId).toBeNull();
  });
});
