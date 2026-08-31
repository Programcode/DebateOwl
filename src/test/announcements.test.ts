import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnouncement } from '@/lib/announcements';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: mockSupabase,
  SUPABASE_URL: 'http://localhost:54321',
}));

describe('announcement API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
  });

  it('passes invalid non-empty dates through for server-side validation', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({
        announcement: {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          title: 'Date validation',
          body: 'The server should reject invalid dates.',
          target_type: 'all',
          target_user_ids: null,
          starts_at: '2026-08-31T12:00:00+00:00',
          expires_at: null,
          created_by: '99999999-9999-4999-8999-999999999999',
          created_at: '2026-08-31T12:00:00+00:00',
        },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });

    await createAnnouncement({
      title: 'Date validation',
      body: 'The server should reject invalid dates.',
      targetType: 'all',
      startsAt: 'not-a-date',
      expiresAt: 'also-not-a-date',
    });

    expect(requestBody.startsAt).toBe('not-a-date');
    expect(requestBody.expiresAt).toBe('also-not-a-date');
  });
});
