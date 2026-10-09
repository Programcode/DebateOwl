import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';

import type { OutputFor, ResultKind } from './results';

/**
 * Results produced in this session, so their document opens at once and still
 * opens when nothing was saved: one-off work, or a save that failed. The
 * researched sources live only here, as they do on the website's page.
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

const results = new Map<string, OpenResult>();
let localId = 0;

/** Keeps a result under its saved id, or a local key when it is not saved. Returns the key to open it with. */
export function keepOpenResult<K extends ResultKind>(result: OpenResult<K>): string {
  const key = result.savedId ?? `local-${Date.now()}-${(localId += 1)}`;
  results.set(key, result as OpenResult);
  return key;
}

export function openResult<K extends ResultKind>(key: string, kind: K): OpenResult<K> | undefined {
  const result = results.get(key);
  return result?.kind === kind ? (result as OpenResult<K>) : undefined;
}

export function updateOpenResult(key: string, patch: Partial<Pick<OpenResult, 'savedId' | 'title'>>) {
  const result = results.get(key);
  if (result) results.set(key, { ...result, ...patch });
}

export function forgetOpenResult(key: string) {
  results.delete(key);
}
