import { describe, expect, it, vi } from 'vitest';
import type { LiveGeneration } from '@/lib/ai/live';

// The provider call is held open so a second screen can join it mid-answer.
let release!: () => void;
let liveOfRequest: LiveGeneration | undefined;
vi.mock('@/lib/ai/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/request')>()),
  callSupabaseAI: vi.fn((_feature: string, _input: unknown, _config: unknown, options: { live?: LiveGeneration; transformResponse: (data: unknown) => unknown }) => {
    liveOfRequest = options.live;
    return new Promise((resolve) => {
      release = () => resolve(options.transformResponse({
        output: { action: 'respond', speech: { content: 'Who pays for the buses?', strategy: 'Press the cost.', targetedPoints: [] } },
      }));
    });
  }),
}));

const { generateSparringTurn } = await import('@/lib/ai/client');

const input = {
  action: 'respond' as const,
  sessionId: '5e551000-0000-4000-8000-000000000003',
  motion: 'This House would make public transport free',
  userSide: 'pro' as const,
  format: 'ld' as const,
  difficulty: 'medium' as const,
  language: 'en',
  speeches: [{ id: 'user-1', turnId: 'ld-1', speaker: 'user' as const, side: 'pro' as const, role: 'Affirmative constructive', content: 'Fares block access.', createdAt: 1, timeLimitSeconds: 360, timeUsedSeconds: 60 }],
  currentTurn: { id: 'ld-2', label: 'Negative constructive', side: 'con' as const, kind: 'constructive' as const, timeLimitSeconds: 420 },
};
const config = { provider: 'openrouter' as const, model: 'openai/gpt-6-luna' };

describe('a shared sparring request', () => {
  it('gives a screen that rejoins it the draft so far and every later one', async () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    const firstCall = generateSparringTurn(input, config, undefined, null, false, { onDraft: (draft) => first.push(draft) });
    await vi.waitFor(() => expect(liveOfRequest).toBeDefined());
    liveOfRequest!.onDraft({ speech: { content: 'Who' } });

    // The screen remounts and asks for the same turn.
    const secondCall = generateSparringTurn(input, config, undefined, null, false, { onDraft: (draft) => second.push(draft) });
    liveOfRequest!.onDraft({ speech: { content: 'Who pays' } });
    release();

    const [a, b] = await Promise.all([firstCall, secondCall]);
    expect(a).toEqual(b);
    expect(first).toEqual([{ speech: { content: 'Who' } }, { speech: { content: 'Who pays' } }]);
    expect(second).toEqual([{ speech: { content: 'Who' } }, { speech: { content: 'Who pays' } }]);
  });
});
