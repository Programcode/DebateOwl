import { useEffect } from 'react';
import { useSessionStore, type SessionState } from '@/lib/stores/session-store';

const SESSION_STORAGE_KEY = 'debate-trainer-storage';

interface PersistedSessionPayload {
  state?: Partial<SessionState>;
}

/** Another tab's snapshot, or null when it belongs to a different account. */
export function persistedSessionFromStorage(newValue: string, currentOwner: string | null): Partial<SessionState> | null {
  const payload = JSON.parse(newValue) as PersistedSessionPayload;
  if (!payload.state) return null;
  const incomingOwner = payload.state.ownerUserId ?? null;
  if (currentOwner && incomingOwner && incomingOwner !== currentOwner) return null;
  return payload.state;
}

export function useSessionStorageSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY || !event.newValue) return;

      try {
        const next = persistedSessionFromStorage(event.newValue, useSessionStore.getState().ownerUserId);
        if (next) useSessionStore.setState(next);
      } catch (error) {
        console.warn('[SessionStore] Failed to sync persisted state from another tab:', error);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
}
