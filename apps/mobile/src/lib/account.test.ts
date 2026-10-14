import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

// A real supabase-js client, so the test sees the Authorization header it actually sends.
const requests = vi.hoisted(() => [] as Request[]);
vi.mock('./supabase', () => ({
  supabase: createClient('http://127.0.0.1:54321', 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    },
  }),
}));

import { clearAllData } from './account';
import { supabase } from './supabase';

const sessionFor = (id: string) => ({ data: { session: { user: { id }, access_token: `token-${id}` } }, error: null });

describe('clearAllData', () => {
  it('deletes with the confirmed account\'s token even if another account signs in before the request is sent', async () => {
    // The first read is the owner check; every later read (supabase-js attaching auth) sees account B.
    vi.spyOn(supabase.auth, 'getSession')
      .mockResolvedValueOnce(sessionFor('user-a') as never)
      .mockResolvedValue(sessionFor('user-b') as never);
    await clearAllData('user-a');
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe('/rest/v1/rpc/clear_current_user_data');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer token-user-a');
  });
});
