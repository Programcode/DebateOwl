import { describe, expect, it, vi } from 'vitest';

const postFunction = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./ai-request', async (original) => ({ ...(await original<typeof import('./ai-request')>()), postFunction }));
vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('./offline-cache', () => ({ afterWrite: vi.fn(), cachedRead: vi.fn(), readFailed: vi.fn(), updateCopy: vi.fn() }));

import { crossfireDebrief, crossfireSignal, crossfireTurn } from './crossfire';

const options = { config: { model: 'openai/gpt-6-luna', reasoningEffort: 'low' as const }, language: 'en' };
const config = { resolution: 'This House would ban private cars', userRole: 'questioner', difficulty: 'medium', turnLimit: 6 } as never;
const body = (call: number) => (postFunction.mock.calls[call] as unknown[])[1] as Record<string, unknown>;

// Main (#201) charges a Crossfire round once: every turn and the debrief carry
// the round's id, so the server's quota ledger charges only the first.
describe('Crossfire quota sessions', () => {
  it("sends the round's id with every turn and the debrief, and none with a signal", async () => {
    await crossfireTurn({ operation: 'next-turn', config, transcript: [], expectedReply: 'question' }, { ...options, quotaSession: 'crossfire-1793180000000' });
    await crossfireDebrief({ operation: 'debrief', config, transcript: [] }, { ...options, quotaSession: 'crossfire-1793180000000' });
    await crossfireSignal({ config, transcript: [], reply: { type: 'answer', text: 'An answer' }, signalToken: 'token' }, options);

    expect(body(0).quotaSession).toBe('crossfire-1793180000000');
    expect(body(1).quotaSession).toBe('crossfire-1793180000000');
    expect(body(2)).not.toHaveProperty('quotaSession');
  });

  it('leaves out a key the server would refuse, so the round is charged per call instead of failing', async () => {
    postFunction.mockClear();
    await crossfireTurn({ operation: 'next-turn', config, transcript: [], expectedReply: 'question' }, { ...options, quotaSession: 'not a key!' });
    expect(body(0)).not.toHaveProperty('quotaSession');
  });
});
