import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Lists the server hydrates again. Drafts and the result on screen stay. */
const BULKY_LISTS = [
  'sourceLibrary',
  'sourceFolders',
  'savedCases',
  'savedAttacks',
  'savedBrainstorms',
  'savedFactoids',
  'savedChats',
  'savedFlowcharts',
  'savedCrossfires',
];

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22;
}

function readState(serialized: string): { envelope: { state?: Record<string, unknown> }; state: Record<string, unknown> } | null {
  try {
    const envelope = JSON.parse(serialized) as { state?: Record<string, unknown> };
    if (!envelope.state || typeof envelope.state !== 'object') return null;
    return { envelope, state: envelope.state };
  } catch {
    return null;
  }
}

/** Drop source text first. Titles and ids stay, so the library does not flash empty. */
export function withoutSourceText(serialized: string): string | null {
  const parsed = readState(serialized);
  if (!parsed || !Array.isArray(parsed.state.sourceLibrary)) return null;
  parsed.state.sourceLibrary = parsed.state.sourceLibrary.map((item) => {
    if (!item || typeof item !== 'object') return item;
    return { ...(item as Record<string, unknown>), content: '' };
  });
  return JSON.stringify(parsed.envelope);
}

/** Last try: forget the bulky copies and keep the open draft. */
export function withoutBulkyLists(serialized: string): string | null {
  const parsed = readState(serialized);
  if (!parsed) return null;
  for (const key of BULKY_LISTS) delete parsed.state[key];
  return JSON.stringify(parsed.envelope);
}

/**
 * Zustand persist lets a full localStorage throw out of a tool page. On a quota
 * error, retry without source text, then without the bulky lists, then keep
 * going in memory.
 */
export function resilientSetItem(storage: Pick<Storage, 'setItem'>, key: string, value: string): void {
  const attempts = [value, withoutSourceText(value), withoutBulkyLists(value)]
    .filter((attempt): attempt is string => typeof attempt === 'string');
  const seen = new Set<string>();
  let lastQuota: unknown;
  for (const attempt of attempts) {
    if (seen.has(attempt)) continue;
    seen.add(attempt);
    try {
      storage.setItem(key, attempt);
      return;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      lastQuota = error;
    }
  }
  console.warn('[SessionStore] Local storage is full; this change stays in memory.', lastQuota);
}

const resilientStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => resilientSetItem(localStorage, name, value),
  removeItem: (name) => localStorage.removeItem(name),
};

export function resilientLocalStorage() {
  return createJSONStorage(() => resilientStorage);
}
