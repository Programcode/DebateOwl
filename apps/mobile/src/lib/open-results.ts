import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';

import { haptics } from './haptics';
import type { OutputFor, ResultKind } from './results';
import { sessionSlot } from './session-memory';

/**
 * Results produced in this session, so their document opens at once and still
 * opens when nothing was saved: one-off work, or a save that failed. The
 * researched sources live only here, as they do on the website's page. They
 * belong to the signed-in account and are forgotten when it changes.
 */
export interface OpenResult<K extends ResultKind = ResultKind> {
  kind: K;
  /** The saved row, or null while the result is not saved anywhere. */
  savedId: string | null;
  title: string;
  side: string | null;
  debateId: string | null;
  createdAt: number;
  input: Record<string, unknown>;
  output: OutputFor[K];
  sources: DiscoveredSource[];
}

const store = sessionSlot(() => new Map<string, OpenResult>());
let localId = 0;

/** Keeps a result under its saved id, or a local key when it is not saved. Returns the key to open it with. A finished result taps success. */
export function keepOpenResult<K extends ResultKind>(result: OpenResult<K>): string {
  haptics.success();
  const key = result.savedId ?? `local-${Date.now()}-${(localId += 1)}`;
  store.get().set(key, result as OpenResult);
  return key;
}

export function openResult<K extends ResultKind>(key: string, kind: K): OpenResult<K> | undefined {
  const result = store.get().get(key);
  return result?.kind === kind ? (result as OpenResult<K>) : undefined;
}

const listeners = new Set<() => void>();

/** Called whenever a held result changes, so a document open on it shows the change. */
export function subscribeOpenResults(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateOpenResult<K extends ResultKind>(key: string, patch: Partial<Pick<OpenResult<K>, 'savedId' | 'title' | 'output' | 'sources'>>) {
  const results = store.get();
  const result = results.get(key);
  if (!result) return;
  results.set(key, { ...result, ...patch } as OpenResult);
  listeners.forEach((listener) => listener());
}

export function forgetOpenResult(key: string) {
  store.get().delete(key);
}
