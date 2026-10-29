import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Tells a session the server ended from one the student signed out of, for
 * the sign-in screen's "Your session expired" notice (the website's
 * src/lib/supabase/session-expiry.ts). supabase-js removes the stored session
 * itself when the server refuses its refresh token, and it can do that while
 * the app is still loading, before any React code listens. So the notice is
 * decided where the removal happens: in the storage the client writes to.
 * A removal counts only when a session was stored, because supabase-js also
 * removes the key on every launch that has none.
 */

let signingOut = 0;
let expired = false;
const listeners = new Set<(expired: boolean) => void>();

function set(next: boolean) {
  if (expired === next) return;
  expired = next;
  listeners.forEach((listener) => listener(next));
}

/** Wraps the session storage so a removal nobody asked for marks the session expired. */
export function watchSessionRemoval(storage: SupportedStorage, sessionKey: string): SupportedStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: async (key, value) => {
      await storage.setItem(key, value);
      // A new session (a sign-in) clears the notice.
      if (key === sessionKey) set(false);
    },
    removeItem: async (key) => {
      const had = key === sessionKey && signingOut === 0 ? (await storage.getItem(key)) !== null : false;
      await storage.removeItem(key);
      if (had) set(true);
    },
  };
}

/** Runs a sign-out the student asked for (or Delete account); its removal is not an expiry. */
export async function signingOutOnPurpose<T>(work: () => Promise<T>): Promise<T> {
  signingOut += 1;
  try {
    return await work();
  } finally {
    signingOut -= 1;
  }
}

export function sessionExpired(): boolean {
  return expired;
}

export function clearSessionExpired() {
  set(false);
}

export function subscribeSessionExpired(listener: (expired: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
