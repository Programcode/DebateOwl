import { useEffect } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';

const SESSION_STORAGE_KEY = 'debate-trainer-storage';

interface PersistedSessionPayload {
  state?: Partial<ReturnType<typeof useSessionStore.getState>>;
}

export function useSessionStorageSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY || !event.newValue) return;

      try {
        const payload = JSON.parse(event.newValue) as PersistedSessionPayload;
        if (!payload.state) return;
        useSessionStore.setState(payload.state);
      } catch (error) {
        console.warn('[SessionStore] Failed to sync persisted state from another tab:', error);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
}
