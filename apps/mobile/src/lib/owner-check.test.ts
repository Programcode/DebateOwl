import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  auth: { getSession: vi.fn() },
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase }));

import { clearAllData } from './account';
import { attachToDebate } from './history';

// attach_to_debate and clear_current_user_data act for whoever holds the session, not for the account the screen showed.
describe('account-wide writes after an account switch', () => {
  beforeEach(() => {
    supabase.rpc.mockReset().mockResolvedValue({ error: null });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-b' } } } });
  });

  it('does not add one account\'s unsorted work to a debate once another account is signed in', async () => {
    const entry = { kind: 'case' as const, id: 'case-1', title: 'A case', createdAt: 0 };
    await expect(attachToDebate('user-a', entry, 'debate-1')).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('does not delete all data once another account is signed in', async () => {
    await expect(clearAllData('user-a')).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
