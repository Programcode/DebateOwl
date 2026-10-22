import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase/client';
import { restoredSessionsBlocked } from '@/lib/supabase/session-expiry';
import { currentUserId } from '@/lib/supabase/current-user';
import { MAX_MOTION_LENGTH } from '@debatelab/core/validation/motion';

export { MAX_MOTION_LENGTH };

/** A favor, En contra, both sides, or not side-specific. */
export type DebateSide = 'pro' | 'con' | 'both' | 'neutral';

export interface DebateSettings {
  format?: string;
  role?: string;
  judge?: string;
}

export interface Debate {
  id: string;
  motion: string;
  settings: DebateSettings;
  instructions: string;
  lastActivityAt: number;
  createdAt: number;
}

export type DebateDialog = 'switch' | 'create' | null;

/** How long a debate may sit without meaningful work before the app asks about it. */
export const INACTIVE_DEBATE_MS = 5 * 24 * 60 * 60 * 1000;
export const MAX_INSTRUCTIONS_LENGTH = 2000;

interface DebateRow {
  id: string;
  motion: string;
  settings: unknown;
  instructions: string | null;
  last_activity_at: string;
  created_at: string;
}

interface DebateState {
  ownerUserId: string | null;
  debates: Debate[];
  currentDebateId: string | null;
  /** Session-only: tools run without reading from or saving to any debate. */
  oneOff: boolean;
  hydrated: boolean;
  dialog: DebateDialog;
  /** Motion to prefill when the create dialog opens from a feature. */
  dialogMotion: string;

  hydrate: () => Promise<void>;
  createDebate: (input: { motion: string; settings?: DebateSettings; instructions?: string }) => Promise<Debate>;
  switchDebate: (id: string) => Promise<void>;
  updateDebate: (id: string, patch: Partial<Pick<Debate, 'motion' | 'settings' | 'instructions'>>) => Promise<void>;
  deleteDebate: (id: string) => Promise<void>;
  continueDebate: () => Promise<void>;
  markActivity: (id: string, at?: number) => void;
  setOneOff: (oneOff: boolean) => void;
  openDialog: (dialog: DebateDialog, motion?: string) => void;
  resetLocalData: () => void;
  /** Drops another account's debate list before the server copy loads. */
  prepareForUser: (userId: string) => void;
}

export function normalizeMotion(motion: string): string {
  return motion.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function sameMotion(a: string | undefined | null, b: string | undefined | null): boolean {
  return Boolean(a && b) && normalizeMotion(a!) === normalizeMotion(b!);
}

function parseSettings(value: unknown): DebateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const settings: DebateSettings = {};
  for (const key of ['format', 'role', 'judge'] as const) {
    if (typeof record[key] === 'string' && record[key]) settings[key] = record[key] as string;
  }
  return settings;
}

function fromRow(row: DebateRow): Debate {
  return {
    id: row.id,
    motion: row.motion,
    settings: parseSettings(row.settings),
    instructions: row.instructions ?? '',
    lastActivityAt: new Date(row.last_activity_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

function sortDebates(debates: Debate[]): Debate[] {
  return [...debates].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Sign in to manage debates');
  return userId;
}

async function setCurrentPointer(userId: string, debateId: string) {
  const { error } = await supabase
    .from('current_debates')
    .upsert({ user_id: userId, debate_id: debateId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

// Invalidates a hydrate that started before sign-out or an account switch.
let hydrationEpoch = 0;
// Counts debate writes so a load that started earlier cannot overwrite them.
let debateWrites = 0;

export const useDebateStore = create<DebateState>()(
  persist(
    (set, get) => ({
      ownerUserId: null as string | null,
      debates: [] as Debate[],
      currentDebateId: null as string | null,
      oneOff: false,
      hydrated: false,
      dialog: null as DebateDialog,
      dialogMotion: '',

      hydrate: async () => {
        if (restoredSessionsBlocked()) return;
        const epoch = hydrationEpoch;
        const userId = await currentUserId();
        if (epoch !== hydrationEpoch || !userId) return;
        if (get().ownerUserId !== userId) {
          set({ ownerUserId: userId, debates: [], currentDebateId: null, oneOff: false, hydrated: false });
        }
        const writesBefore = debateWrites;
        const [debatesResult, currentResult] = await Promise.all([
          supabase.from('debates').select('id,motion,settings,instructions,last_activity_at,created_at').order('last_activity_at', { ascending: false }),
          supabase.from('current_debates').select('debate_id').maybeSingle(),
        ]);
        if (epoch !== hydrationEpoch) return;
        if (writesBefore !== debateWrites) {
          // A create, switch, edit or delete landed mid-load; this snapshot is older than it.
          await get().hydrate();
          return;
        }
        if (debatesResult.error || currentResult.error) {
          console.warn('[DebateStore] Failed to hydrate debates:', debatesResult.error?.message ?? currentResult.error?.message);
          return;
        }
        const debates = ((debatesResult.data ?? []) as DebateRow[]).map(fromRow);
        const currentId = (currentResult.data as { debate_id?: string } | null)?.debate_id ?? null;
        set({
          debates: sortDebates(debates),
          currentDebateId: currentId && debates.some((debate) => debate.id === currentId) ? currentId : null,
          hydrated: true,
        });
      },

      createDebate: async ({ motion, settings = {}, instructions = '' }) => {
        const trimmed = motion.trim();
        if (!trimmed) throw new Error('A debate needs a motion');
        const userId = await requireUserId();
        const { data, error } = await supabase
          .from('debates')
          .insert({
            user_id: userId,
            motion: trimmed.slice(0, MAX_MOTION_LENGTH),
            settings,
            instructions: instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH),
          })
          .select('id,motion,settings,instructions,last_activity_at,created_at')
          .single();
        if (error || !data) throw new Error(error?.message ?? 'Could not create debate');
        const debate = fromRow(data as DebateRow);
        await setCurrentPointer(userId, debate.id);
        debateWrites += 1;
        set((state) => ({
          ownerUserId: userId,
          debates: sortDebates([debate, ...state.debates.filter((item) => item.id !== debate.id)]),
          currentDebateId: debate.id,
          oneOff: false,
        }));
        return debate;
      },

      switchDebate: async (id) => {
        const debate = get().debates.find((item) => item.id === id);
        if (!debate) throw new Error('Debate not found');
        const userId = await requireUserId();
        await setCurrentPointer(userId, id);
        // Choosing a debate is a deliberate confirmation that it is still being prepared.
        const now = Date.now();
        await supabase.from('debates').update({ last_activity_at: new Date(now).toISOString() }).eq('id', id);
        debateWrites += 1;
        set((state) => ({
          currentDebateId: id,
          oneOff: false,
          debates: sortDebates(state.debates.map((item) => item.id === id ? { ...item, lastActivityAt: now } : item)),
        }));
      },

      updateDebate: async (id, patch) => {
        const current = get().debates.find((item) => item.id === id);
        if (!current) throw new Error('Debate not found');
        const next: Debate = {
          ...current,
          ...(patch.motion !== undefined ? { motion: patch.motion.trim().slice(0, MAX_MOTION_LENGTH) || current.motion } : {}),
          ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
          ...(patch.instructions !== undefined ? { instructions: patch.instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH) } : {}),
        };
        const { error } = await supabase
          .from('debates')
          .update({ motion: next.motion, settings: next.settings, instructions: next.instructions, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw new Error(error.message);
        debateWrites += 1;
        set((state) => ({ debates: state.debates.map((item) => item.id === id ? next : item) }));
      },

      deleteDebate: async (id) => {
        const { error } = await supabase.from('debates').delete().eq('id', id);
        if (error) throw new Error(error.message);
        debateWrites += 1;
        set((state) => ({
          debates: state.debates.filter((item) => item.id !== id),
          currentDebateId: state.currentDebateId === id ? null : state.currentDebateId,
        }));
      },

      continueDebate: async () => {
        const id = get().currentDebateId;
        if (!id) return;
        const now = Date.now();
        const { error } = await supabase.from('debates').update({ last_activity_at: new Date(now).toISOString() }).eq('id', id);
        if (error) throw new Error(error.message);
        get().markActivity(id, now);
      },

      markActivity: (id, at = Date.now()) => set((state) => ({
        debates: sortDebates(state.debates.map((item) => item.id === id ? { ...item, lastActivityAt: Math.max(item.lastActivityAt, at) } : item)),
      })),

      setOneOff: (oneOff) => set({ oneOff }),
      openDialog: (dialog, motion = '') => set({ dialog, dialogMotion: motion }),

      resetLocalData: () => {
        hydrationEpoch += 1;
        set({ ownerUserId: null, debates: [], currentDebateId: null, oneOff: false, hydrated: false, dialog: null, dialogMotion: '' });
      },

      prepareForUser: (userId) => {
        if (get().ownerUserId === userId) return;
        hydrationEpoch += 1;
        set({ ownerUserId: userId, debates: [], currentDebateId: null, oneOff: false, hydrated: false, dialog: null, dialogMotion: '' });
      },
    }),
    {
      name: 'debatelab-current-debate',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      merge: mergePersistedDebateState,
      partialize: (state) => ({
        ownerUserId: state.ownerUserId,
        debates: state.debates,
        currentDebateId: state.currentDebateId,
      }),
    },
  ),
);

/**
 * A rehydrate that finishes after sign-in must not restore another account's
 * debate list. Lists saved before an owner was recorded stay only until this
 * account is bound.
 */
export function mergePersistedDebateState(persistedState: unknown, currentState: DebateState): DebateState {
  const saved = persistedState && typeof persistedState === 'object' ? persistedState as Partial<DebateState> : {};
  const savedOwner = typeof saved.ownerUserId === 'string' ? saved.ownerUserId : null;
  if (currentState.ownerUserId && savedOwner !== currentState.ownerUserId) return currentState;
  return { ...currentState, ...saved, ownerUserId: savedOwner ?? currentState.ownerUserId };
}

export function selectCurrentDebate(state: Pick<DebateState, 'debates' | 'currentDebateId'>): Debate | null {
  return state.debates.find((debate) => debate.id === state.currentDebateId) ?? null;
}

export function useCurrentDebate(): Debate | null {
  return useDebateStore(selectCurrentDebate);
}

/** The debate that new work attaches to right now, or null for one-off work. */
export function activeDebateId(): string | null {
  const state = useDebateStore.getState();
  if (state.oneOff) return null;
  return selectCurrentDebate(state)?.id ?? null;
}

export function isDebateInactive(debate: Debate, now = Date.now()): boolean {
  return now - debate.lastActivityAt > INACTIVE_DEBATE_MS;
}
