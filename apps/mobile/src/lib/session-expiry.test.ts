import { beforeEach, describe, expect, it } from 'vitest';

import { clearSessionExpired, sessionExpired, signingOutOnPurpose, watchSessionRemoval } from './session-expiry';

const KEY = 'sb-test-auth-token';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
    removeItem: async (key: string) => void items.delete(key),
  };
}

describe('watchSessionRemoval', () => {
  beforeEach(() => clearSessionExpired());

  it('marks the session expired when supabase-js removes a stored session by itself (a refused refresh)', async () => {
    const storage = watchSessionRemoval(memoryStorage({ [KEY]: '{"refresh_token":"r"}' }), KEY);
    await storage.removeItem(KEY);
    expect(sessionExpired()).toBe(true);
  });

  it('says nothing on a signed-out launch, where supabase-js removes a key that holds no session', async () => {
    const storage = watchSessionRemoval(memoryStorage(), KEY);
    await storage.removeItem(KEY);
    expect(sessionExpired()).toBe(false);
  });

  it('says nothing when the student signs out, and ignores other keys', async () => {
    const storage = watchSessionRemoval(memoryStorage({ [KEY]: 'session', [`${KEY}-code-verifier`]: 'v' }), KEY);
    await signingOutOnPurpose(async () => {
      await storage.removeItem(KEY);
    });
    await storage.removeItem(`${KEY}-code-verifier`);
    expect(sessionExpired()).toBe(false);
  });

  it('clears the notice when a new session is stored', async () => {
    const storage = watchSessionRemoval(memoryStorage({ [KEY]: 'old' }), KEY);
    await storage.removeItem(KEY);
    await storage.setItem(KEY, 'new');
    expect(sessionExpired()).toBe(false);
  });
});
