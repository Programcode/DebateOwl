import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteResult, getUser } = vi.hoisted(() => ({
  deleteResult: { error: null as { message: string } | null },
  getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } as { id: string } | null } })),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getUser },
    from: () => ({
      delete: () => {
        const query = {
          eq: () => query,
          then: (resolve: (value: { error: { message: string } | null }) => void, reject?: (reason: unknown) => void) => (
            Promise.resolve({ error: deleteResult.error }).then(resolve, reject)
          ),
        };
        return query;
      },
    }),
  },
}));

import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { useSessionStore } from '@/lib/stores/session-store';

const savedCase = {
  id: 'case-1',
  title: 'Saved motion',
  createdAt: 1,
  debateId: 'debate-1',
  data: {
    caseStructure: { thesis: 'Thesis', framework: '', keyDefinitions: [] as string[], burdenOfProof: '' },
    contentions: [] as GenerateOutput['contentions'],
    predictedOpponentCase: {
      likelyArguments: [] as string[],
      strategicWeaknesses: [] as string[],
      keyClashes: [] as string[],
    },
    counters: [] as GenerateOutput['counters'],
    metadata: { side: 'pro' as const, format: 'custom', generatedAt: '2026-01-01T00:00:00Z' },
  } satisfies GenerateOutput,
};

describe('deleting a saved case', () => {
  beforeEach(() => {
    deleteResult.error = null;
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    useSessionStore.setState({ savedCases: [savedCase] });
  });

  it('removes the case after the server delete succeeds', async () => {
    await useSessionStore.getState().deleteSavedCase('case-1');
    expect(useSessionStore.getState().savedCases).toEqual([]);
  });

  it('puts the case back and reports the failure when the server delete fails', async () => {
    deleteResult.error = { message: 'permission denied' };
    await expect(useSessionStore.getState().deleteSavedCase('case-1')).rejects.toThrow(/delete case/);
    expect(useSessionStore.getState().savedCases).toEqual([savedCase]);
  });

  it('puts the case back when the session cannot be confirmed', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(useSessionStore.getState().deleteSavedCase('case-1')).rejects.toThrow(/signed-in user/);
    expect(useSessionStore.getState().savedCases).toEqual([savedCase]);
  });
});
