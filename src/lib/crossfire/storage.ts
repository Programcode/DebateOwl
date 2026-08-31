import {
  PersistedCrossfireDraftSchema,
  type CrossfireState,
  type PersistedCrossfireDraft,
} from './schemas';

export const CROSSFIRE_STORAGE_KEY_PREFIX = 'debatelab-crossfire-draft';
export const MAX_CROSSFIRE_STORAGE_CHARS = 80_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function crossfireStorageKey(ownerId: string): string {
  return `${CROSSFIRE_STORAGE_KEY_PREFIX}:${ownerId}`;
}

export function loadCrossfireDraft(
  ownerId: string,
  storage: StorageLike | null = browserStorage(),
): PersistedCrossfireDraft['state'] | null {
  if (!storage || !ownerId) return null;
  const key = crossfireStorageKey(ownerId);
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return null;
  }
  if (!serialized) return null;
  if (serialized.length > MAX_CROSSFIRE_STORAGE_CHARS) {
    try { storage.removeItem(key); } catch { return null; }
    return null;
  }

  try {
    const parsed = PersistedCrossfireDraftSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success || parsed.data.ownerId !== ownerId) {
      try { storage.removeItem(key); } catch { return null; }
      return null;
    }
    return parsed.data.state;
  } catch {
    try { storage.removeItem(key); } catch { return null; }
    return null;
  }
}

export function saveCrossfireDraft(
  ownerId: string,
  state: CrossfireState,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage || !ownerId) return false;
  const key = crossfireStorageKey(ownerId);
  if (state.phase === 'complete') {
    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  const draft: PersistedCrossfireDraft = {
    version: 1,
    ownerId,
    savedAt: now,
    state,
  };
  const parsed = PersistedCrossfireDraftSchema.safeParse(draft);
  if (!parsed.success) return false;

  const serialized = JSON.stringify(parsed.data);
  if (serialized.length > MAX_CROSSFIRE_STORAGE_CHARS) return false;
  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearCrossfireDraft(ownerId: string, storage: StorageLike | null = browserStorage()): void {
  if (!ownerId || !storage) return;
  try { storage.removeItem(crossfireStorageKey(ownerId)); } catch { /* storage unavailable */ }
}

export function clearCrossfireDraftOnAuthChange(
  previousUserId: string | undefined,
  nextUserId: string | undefined,
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (previousUserId === nextUserId) return false;
  if (previousUserId) {
    try { storage?.removeItem(crossfireStorageKey(previousUserId)); } catch { /* storage unavailable */ }
  }
  return true;
}
