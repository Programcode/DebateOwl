import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const afterWrite = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({ supabase: { rpc } }));
vi.mock('./offline-cache', () => ({ afterWrite, cachedRead: vi.fn(), readFailed: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));

import { debateListScopes } from './debates';
import { attachSparring } from './sparring';

describe('attachSparring', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ error: null });
    afterWrite.mockReset();
  });

  it('drops the one-off History copy when a judged round is filed in its debate', async () => {
    await attachSparring('user-1', 'round-1', 'debate-1', 'pro');
    expect(rpc).toHaveBeenCalledWith('attach_to_debate', {
      p_kind: 'sparring',
      p_id: 'round-1',
      p_debate_id: 'debate-1',
      p_side: 'pro',
    });
    const scopes = afterWrite.mock.calls[0]?.[1] as { group: string; key?: string }[];
    expect(scopes).toEqual(expect.arrayContaining(debateListScopes(null, 'sparring')));
    expect(scopes).toEqual(expect.arrayContaining([{ group: 'history', key: 'one-off' }]));
  });
});
