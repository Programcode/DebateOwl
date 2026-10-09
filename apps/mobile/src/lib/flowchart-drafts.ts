import type { FlowchartDocument } from '@debatelab/core/flowchart';
import { useSyncExternalStore } from 'react';

import type { SavedFlowchart } from './flowcharts';
import { sessionSlot } from './session-memory';

/**
 * The maps being worked on, kept in session memory until they are saved: per
 * debate (one-off work has its own), the map on screen and the edits held for
 * each map opened this session. The website keeps one map on its canvas and
 * does not warn before a load replaces it; the app keeps every map's edits
 * instead, and forgets them all when the account changes. The Flowchart
 * screen and its sheets are separate routes, so they share the maps here.
 */

export interface FlowchartDraft {
  /** The saved row, or null for a map not saved yet. */
  savedId: string | null;
  title: string;
  /** The debate the map belongs to; null for one-off work. */
  debateId: string | null;
  createdAt: number | null;
  doc: FlowchartDocument;
  /** Changed since it was opened or last saved. */
  edited: boolean;
}

interface Scope {
  open: string | null;
  drafts: Map<string, FlowchartDraft>;
}

/** The key of the one map per debate that has not been saved yet. */
export const NEW_MAP = 'new';

const scopes = sessionSlot(() => new Map<string, Scope>());
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function scopeFor(scope: string): Scope {
  const all = scopes.get();
  let entry = all.get(scope);
  if (!entry) {
    entry = { open: null, drafts: new Map() };
    all.set(scope, entry);
  }
  return entry;
}

/** Where a debate's maps are kept: its id, or `one-off` for one-off work. */
export function scopeKey(debateId: string | null): string {
  return debateId ?? 'one-off';
}

/** The debate a scope key stands for. */
export function scopeDebateId(scope: string): string | null {
  return scope === 'one-off' ? null : scope;
}

export function savedDraft(row: SavedFlowchart): FlowchartDraft {
  return { savedId: row.id, title: row.title, debateId: row.debateId, createdAt: row.createdAt, doc: row.doc, edited: false };
}

/** A map not saved yet: the website's starter map, in the debate (or one-off work) it will be saved to. */
export function newDraft(debateId: string | null, doc: FlowchartDocument): FlowchartDraft {
  return { savedId: null, title: '', debateId, createdAt: null, doc, edited: false };
}

export function draftKey(draft: Pick<FlowchartDraft, 'savedId'>): string {
  return draft.savedId ?? NEW_MAP;
}

/** The map on screen for a debate, if one was opened this session. */
export function openDraft(scope: string): { key: string; draft: FlowchartDraft } | null {
  const entry = scopes.get().get(scope);
  const draft = entry?.open ? entry.drafts.get(entry.open) : undefined;
  return entry?.open && draft ? { key: entry.open, draft } : null;
}

/** Where a saved map is held this session, if it is. */
export function findSavedDraft(savedId: string): { scope: string; draft: FlowchartDraft } | null {
  for (const [scope, entry] of scopes.get()) {
    const draft = entry.drafts.get(savedId);
    if (draft) return { scope, draft };
  }
  return null;
}

export function getDraft(scope: string, key: string): FlowchartDraft | undefined {
  return scopes.get().get(scope)?.drafts.get(key);
}

/** Puts a map on screen. Edits already held for it stay unless `replace` is set. Returns its key. */
export function showDraft(scope: string, draft: FlowchartDraft, options: { replace?: boolean } = {}): string {
  const entry = scopeFor(scope);
  const key = draftKey(draft);
  if (options.replace || !entry.drafts.has(key)) entry.drafts.set(key, draft);
  entry.open = key;
  emit();
  return key;
}

/** Changes one held map. Resolves false when it is no longer held, for example after the account changed. */
export function updateDraft(scope: string, key: string, change: (draft: FlowchartDraft) => FlowchartDraft): boolean {
  const entry = scopes.get().get(scope);
  const draft = entry?.drafts.get(key);
  if (!entry || !draft) return false;
  const next = change(draft);
  entry.drafts.delete(key);
  entry.drafts.set(draftKey(next), next);
  if (entry.open === key) entry.open = draftKey(next);
  emit();
  return true;
}

export function forgetDraft(scope: string, key: string) {
  const entry = scopes.get().get(scope);
  if (!entry) return;
  entry.drafts.delete(key);
  if (entry.open === key) entry.open = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when any held map changes; read the maps with openDraft and getDraft. */
export function useFlowchartDrafts(): number {
  return useSyncExternalStore(subscribe, () => version);
}
