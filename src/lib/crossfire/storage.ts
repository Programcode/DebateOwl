import * as core from '@debatelab/core/crossfire/storage';
import type { StorageLike } from '@debatelab/core/crossfire/storage';
import type { CrossfireState, PersistedCrossfireDraft } from '@debatelab/core/crossfire/schemas';

export { CROSSFIRE_STORAGE_KEY_PREFIX, MAX_CROSSFIRE_STORAGE_CHARS, crossfireStorageKey } from '@debatelab/core/crossfire/storage';

// The shared module takes storage explicitly; the web defaults to localStorage.
function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadCrossfireDraft(
  ownerId: string,
  storage: StorageLike | null = browserStorage(),
): PersistedCrossfireDraft['state'] | null {
  return core.loadCrossfireDraft(ownerId, storage);
}

export function saveCrossfireDraft(
  ownerId: string,
  state: CrossfireState,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): boolean {
  return core.saveCrossfireDraft(ownerId, state, storage, now);
}

export function clearCrossfireDraft(ownerId: string, storage: StorageLike | null = browserStorage()): void {
  core.clearCrossfireDraft(ownerId, storage);
}

export function clearCrossfireDraftOnAuthChange(
  previousUserId: string | undefined,
  nextUserId: string | undefined,
  storage: StorageLike | null = browserStorage(),
): boolean {
  return core.clearCrossfireDraftOnAuthChange(previousUserId, nextUserId, storage);
}
