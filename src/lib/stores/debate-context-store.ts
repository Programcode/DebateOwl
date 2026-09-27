import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type {
  DebateContextFeature,
  DebateContextOutputKind,
  DebateOutputRef,
} from '../../../supabase/functions/_shared/debate-context';
import { isDebateContextOutputKind, MAX_PINNED_OUTPUTS } from '../../../supabase/functions/_shared/debate-context';

/** What the server reported about the last request's Current Debate context. */
export interface DebateContextUsage {
  debateId: string;
  sourcesUsed: number;
  sourcesOmittedForSize: number;
  sourcesShortened: number;
  sourcesUnavailable: number;
  outputsUsed: DebateOutputRef[];
  outputsOmittedForSize: DebateOutputRef[];
  outputsUnavailable: number;
  instructionsUsed: boolean;
}

/** One request's include/exclude choices, made in Review. */
export interface DebateContextOverride {
  debateId: string;
  sources: Record<string, boolean>;
  outputs: Record<string, boolean>;
}

export function outputKey(ref: DebateOutputRef): string {
  return `${ref.kind}:${ref.id}`;
}

interface DebateContextState {
  /** Pinned results per debate. Pins persist; they follow the student across devices. */
  pins: Record<string, DebateOutputRef[]>;
  pinsLoaded: Record<string, boolean>;
  /** Per-feature choices for the next request only. */
  overrides: Partial<Record<DebateContextFeature, DebateContextOverride>>;
  lastUsage: Partial<Record<DebateContextFeature, DebateContextUsage>>;

  loadPins: (debateId: string) => Promise<void>;
  togglePin: (debateId: string, ref: DebateOutputRef) => Promise<void>;
  setSourceChoice: (feature: DebateContextFeature, debateId: string, sourceId: string, include: boolean) => void;
  setOutputChoice: (feature: DebateContextFeature, debateId: string, ref: DebateOutputRef, include: boolean) => void;
  resetOverride: (feature: DebateContextFeature) => void;
  recordUsage: (feature: DebateContextFeature, usage: DebateContextUsage | null) => void;
  resetLocalData: () => void;
}

function ensureOverride(current: DebateContextOverride | undefined, debateId: string): DebateContextOverride {
  return current && current.debateId === debateId ? current : { debateId, sources: {}, outputs: {} };
}

export const useDebateContextStore = create<DebateContextState>()((set, get) => ({
  pins: {},
  pinsLoaded: {},
  overrides: {},
  lastUsage: {},

  loadPins: async (debateId) => {
    const { data, error } = await supabase
      .from('debate_context_pins')
      .select('item_kind,item_id')
      .eq('debate_id', debateId);
    // Pins are an optional preference. Until the table exists everywhere, or
    // if it cannot be read, requests fall back to the automatic selection.
    if (error) {
      set((state) => ({ pinsLoaded: { ...state.pinsLoaded, [debateId]: true } }));
      return;
    }
    const pins = ((data ?? []) as Array<{ item_kind: unknown; item_id: unknown }>).flatMap((row) =>
      isDebateContextOutputKind(row.item_kind) && typeof row.item_id === 'string'
        ? [{ kind: row.item_kind as DebateContextOutputKind, id: row.item_id }]
        : []);
    set((state) => ({
      pins: { ...state.pins, [debateId]: pins },
      pinsLoaded: { ...state.pinsLoaded, [debateId]: true },
    }));
  },

  togglePin: async (debateId, ref) => {
    const current = get().pins[debateId] ?? [];
    const pinned = current.some((item) => outputKey(item) === outputKey(ref));
    if (!pinned && current.length >= MAX_PINNED_OUTPUTS) throw new Error('pin_limit');
    const next = pinned ? current.filter((item) => outputKey(item) !== outputKey(ref)) : [...current, ref];
    set((state) => ({ pins: { ...state.pins, [debateId]: next } }));
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    const result = !userId
      ? { error: { message: 'Sign in to pin results' } }
      : pinned
        ? await supabase.from('debate_context_pins').delete()
          .eq('user_id', userId).eq('debate_id', debateId).eq('item_kind', ref.kind).eq('item_id', ref.id)
        : await supabase.from('debate_context_pins').insert({ user_id: userId, debate_id: debateId, item_kind: ref.kind, item_id: ref.id });
    if (result.error) {
      set((state) => ({ pins: { ...state.pins, [debateId]: current } }));
      throw new Error(result.error.message ?? 'Could not save the pin');
    }
  },

  setSourceChoice: (feature, debateId, sourceId, include) => set((state) => {
    const override = ensureOverride(state.overrides[feature], debateId);
    return { overrides: { ...state.overrides, [feature]: { ...override, sources: { ...override.sources, [sourceId]: include } } } };
  }),

  setOutputChoice: (feature, debateId, ref, include) => set((state) => {
    const override = ensureOverride(state.overrides[feature], debateId);
    return { overrides: { ...state.overrides, [feature]: { ...override, outputs: { ...override.outputs, [outputKey(ref)]: include } } } };
  }),

  resetOverride: (feature) => set((state) => {
    if (!state.overrides[feature]) return state;
    const overrides = { ...state.overrides };
    delete overrides[feature];
    return { overrides };
  }),

  recordUsage: (feature, usage) => set((state) => {
    const lastUsage = { ...state.lastUsage };
    if (usage) lastUsage[feature] = usage;
    else delete lastUsage[feature];
    return { lastUsage };
  }),

  resetLocalData: () => set({ pins: {}, pinsLoaded: {}, overrides: {}, lastUsage: {} }),
}));

/** Reads the server's `meta.debateContext`, ignoring anything malformed. */
export function parseDebateContextUsage(value: unknown): DebateContextUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const meta = value as Record<string, unknown>;
  const count = (key: string) => typeof meta[key] === 'number' && Number.isFinite(meta[key]) ? Math.max(0, meta[key] as number) : 0;
  const refs = (key: string): DebateOutputRef[] => Array.isArray(meta[key])
    ? (meta[key] as unknown[]).flatMap((item) => {
      const ref = item as { kind?: unknown; id?: unknown } | null;
      return ref && isDebateContextOutputKind(ref.kind) && typeof ref.id === 'string' ? [{ kind: ref.kind, id: ref.id }] : [];
    })
    : [];
  if (typeof meta.debateId !== 'string') return null;
  return {
    debateId: meta.debateId,
    sourcesUsed: count('sourcesUsed'),
    sourcesOmittedForSize: count('sourcesOmittedForSize'),
    sourcesShortened: count('sourcesShortened'),
    sourcesUnavailable: count('sourcesUnavailable'),
    outputsUsed: refs('outputsUsed'),
    outputsOmittedForSize: refs('outputsOmittedForSize'),
    outputsUnavailable: count('outputsUnavailable'),
    instructionsUsed: meta.instructionsUsed === true,
  };
}
