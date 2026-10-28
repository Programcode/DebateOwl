import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureProductEventMock, activeUser } = vi.hoisted(() => ({
  captureProductEventMock: vi.fn(),
  activeUser: { id: null as string | null },
}));

vi.mock('@/lib/observability', () => ({ captureProductEvent: captureProductEventMock }));
vi.mock('@/lib/supabase/client', () => ({ getActiveUserId: () => activeUser.id }));

import {
  captureFirstAISuccess,
  captureOncePerAccount,
  captureSignupCompleted,
  captureTrialStarted,
  captureWelcomeCompleted,
} from '@/lib/activation-events';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const newUser = (id: string, appMetadata: Record<string, unknown>) => ({ id, created_at: '2026-10-28T11:50:00Z', app_metadata: appMetadata });

function sent(name: string) {
  return captureProductEventMock.mock.calls.filter(([event]) => event === name);
}

describe('activation events', () => {
  beforeEach(() => {
    localStorage.clear();
    captureProductEventMock.mockReset();
    activeUser.id = null;
  });

  it('sends first_ai_success once per account, and again for another account', () => {
    activeUser.id = 'user-a';
    captureFirstAISuccess('ask');
    captureFirstAISuccess('generate');
    activeUser.id = 'user-b';
    captureFirstAISuccess('crossfire');

    expect(sent('first_ai_success')).toEqual([
      ['first_ai_success', { tool: 'ask' }],
      ['first_ai_success', { tool: 'crossfire' }],
    ]);
  });

  it('sends nothing without an account or when storage cannot remember', () => {
    captureFirstAISuccess('ask');
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined };
    expect(captureOncePerAccount('welcome_completed', 'user-a', undefined, blocked)).toBe(false);
    expect(captureOncePerAccount('welcome_completed', 'user-a', undefined, null)).toBe(false);
    expect(captureProductEventMock).not.toHaveBeenCalled();
  });

  it('counts a new account once, with how it signed up, and not a returning one', () => {
    expect(captureSignupCompleted(newUser('google-user', { provider: 'google' }), NOW)).toBe(true);
    expect(captureSignupCompleted(newUser('google-user', { provider: 'google' }), NOW)).toBe(false);
    expect(captureSignupCompleted(newUser('demo-user', { provider: 'email', demo_access_code_id: 'code-1' }), NOW)).toBe(true);
    expect(captureSignupCompleted({ id: 'old-user', created_at: '2026-09-01T00:00:00Z', app_metadata: { provider: 'email' } }, NOW)).toBe(false);

    expect(sent('signup_completed')).toEqual([
      ['signup_completed', { method: 'google' }],
      ['signup_completed', { method: 'demo' }],
    ]);
  });

  it('starts the trial once for a new account on the trial plan only', () => {
    expect(captureTrialStarted(newUser('trial-user', { provider: 'email' }), 'expired', NOW)).toBe(false);
    expect(captureTrialStarted(newUser('trial-user', { provider: 'email' }), 'trial', NOW)).toBe(true);
    expect(captureTrialStarted(newUser('trial-user', { provider: 'email' }), 'trial', NOW)).toBe(false);
    expect(captureTrialStarted({ id: 'old-user', created_at: '2026-01-01T00:00:00Z' }, 'trial', NOW)).toBe(false);
    expect(sent('trial_started')).toHaveLength(1);
  });

  it('sends welcome_completed once per account', () => {
    captureWelcomeCompleted('user-a');
    captureWelcomeCompleted('user-a');
    captureWelcomeCompleted(undefined);
    expect(sent('welcome_completed')).toHaveLength(1);
  });
});
