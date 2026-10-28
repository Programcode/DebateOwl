import { isDebateContextOutputKind, MAX_PINNED_OUTPUTS, type DebateContextFeature, type DebateContextOutputKind, type DebateContextSide, type DebateOutputRef } from '@debatelab/core/contract/debate-context';
import {
  outputKey,
  planDebateContext,
  type DebateContextOverride,
  type DebateContextPlan,
  type PlanResult,
  type PlanSource,
  type PlanSparringSession,
} from '@debatelab/core/debate/context-plan';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useAuth } from './auth';
import { sessionSlot } from './session-memory';
import { supabase } from './supabase';

/**
 * The Current Debate material a request sends, as the website plans it
 * (packages/core/src/debate/context-plan.ts) with its Review choices and pins
 * (src/lib/stores/debate-context-store.ts): the material read once per form
 * opening, the choices for one feature's next request, and the debate's pins
 * in debate_context_pins (three at most). The line on each tool form, its
 * Review sheet and the request itself read the same plan.
 */

type ResultKind = Exclude<DebateContextOutputKind, 'sparring'>;

const RESULT_TABLES = {
  case: 'cases',
  attack: 'attacks',
  brainstorm: 'brainstorms',
  factoids: 'factoids',
  crossfire: 'crossfires',
} as const satisfies Partial<Record<ResultKind, string>>;
const RESULT_KINDS = Object.keys(RESULT_TABLES) as (keyof typeof RESULT_TABLES)[];

export interface ContextMaterial {
  debateId: string;
  sources: PlanSource[];
  results: Partial<Record<ResultKind, PlanResult[]>>;
  sparring: PlanSparringSession[];
  pins: DebateOutputRef[];
}

const material = sessionSlot(() => new Map<string, ContextMaterial>());
const overrides = sessionSlot((): Partial<Record<DebateContextFeature, DebateContextOverride>> => ({}));
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function rowsOf<T>(result: { data: unknown; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

const time = (value: string) => new Date(value).getTime();

/**
 * Reads a debate's material: its sources, saved results with their outputs
 * (chats with their messages), judged Sparring rounds and pins. Every read
 * filters on the user; row level security is the real boundary. Pins are
 * optional: if they cannot be read, the automatic selection is used.
 */
export async function loadContextMaterial(userId: string, debateId: string): Promise<ContextMaterial> {
  const [sources, pins, sparring, chats, ...results] = await Promise.all([
    supabase.from('sources').select('id,title,content,type,is_active').eq('user_id', userId).eq('debate_id', debateId).order('created_at', { ascending: false }),
    supabase.from('debate_context_pins').select('item_kind,item_id').eq('user_id', userId).eq('debate_id', debateId),
    supabase.from('sparring_sessions').select('id,motion,user_side,updated_at,final_evaluation').eq('user_id', userId).eq('debate_id', debateId),
    supabase.from('chats').select('id,title,side,created_at,messages(role,content,created_at)').eq('user_id', userId).eq('debate_id', debateId),
    ...RESULT_KINDS.map((kind) => supabase.from(RESULT_TABLES[kind]).select('id,title,side,created_at,output').eq('user_id', userId).eq('debate_id', debateId)),
  ]);
  const next: ContextMaterial = {
    debateId,
    sources: rowsOf<{ id: string; title: string; content: string | null; type: string | null; is_active: boolean }>(sources).map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content ?? '',
      type: row.type ?? 'text',
      debateId,
      isActive: row.is_active,
    })),
    results: {
      chat: rowsOf<{ id: string; title: string; side: string | null; created_at: string; messages: { role: string; content: string; created_at: string }[] | null }>(chats).map((row) => ({
        id: row.id,
        title: row.title,
        side: row.side,
        debateId,
        createdAt: time(row.created_at),
        data: [...(row.messages ?? [])].sort((a, b) => time(a.created_at) - time(b.created_at)).map(({ role, content }) => ({ role, content })),
      })),
    },
    sparring: rowsOf<{ id: string; motion: string; user_side: string | null; updated_at: string; final_evaluation: unknown }>(sparring).map((row) => ({
      id: row.id,
      motion: row.motion,
      debateId,
      userSide: row.user_side,
      updatedAt: time(row.updated_at),
      scorecard: row.final_evaluation,
    })),
    pins: pins.error
      ? []
      : ((pins.data ?? []) as { item_kind: unknown; item_id: unknown }[]).flatMap((row) =>
          isDebateContextOutputKind(row.item_kind) && typeof row.item_id === 'string' ? [{ kind: row.item_kind, id: row.item_id }] : []),
  };
  RESULT_KINDS.forEach((kind, index) => {
    next.results[kind] = rowsOf<{ id: string; title: string; side: string | null; created_at: string; output: unknown }>(results[index]).map((row) => ({
      id: row.id,
      title: row.title,
      side: row.side,
      debateId,
      createdAt: time(row.created_at),
      data: row.output,
    }));
  });
  material.get().set(debateId, next);
  emit();
  return next;
}

interface PlanOptions {
  /** The chat open in Ask is already the conversation. */
  excludeChatId?: string | null;
  /** False when the request reads no Library sources, as Crossfire with grounding off. */
  includeSources?: boolean;
}

function planFor(held: ContextMaterial, feature: DebateContextFeature, side: DebateContextSide, options: PlanOptions): DebateContextPlan {
  return planDebateContext(feature, side, held.debateId, {
    sourceLibrary: held.sources,
    results: held.results,
    sparringSessions: held.sparring,
    pins: held.pins,
    override: overrides.get()[feature],
    excludeChatId: options.excludeChatId ?? null,
  }, { includeSources: options.includeSources });
}

/** The plan for a request about to be sent, from material read now. */
export async function planRequest(userId: string, debateId: string, feature: DebateContextFeature, side: DebateContextSide, options: PlanOptions = {}): Promise<DebateContextPlan> {
  return planFor(await loadContextMaterial(userId, debateId), feature, side, options);
}

/** The plan for a form on screen: read when the form comes into view, kept current as choices and pins change. */
export function useContextPlan(feature: DebateContextFeature, side: DebateContextSide, debateId: string | null, options: PlanOptions = {}): DebateContextPlan | null {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const current = useSyncExternalStore(subscribe, () => version);
  useFocusEffect(
    useCallback(() => {
      if (!userId || !debateId) return;
      loadContextMaterial(userId, debateId).catch((cause: unknown) => console.warn('Could not read the debate context:', cause instanceof Error ? cause.message : cause));
    }, [userId, debateId]),
  );
  const { excludeChatId, includeSources } = options;
  return useMemo(() => {
    const held = debateId ? material.get().get(debateId) : undefined;
    return held ? planFor(held, feature, side, { excludeChatId, includeSources }) : null;
    // `current` changes whenever the material, a choice or a pin does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, debateId, feature, side, excludeChatId, includeSources]);
}

function ensureOverride(feature: DebateContextFeature, debateId: string): DebateContextOverride {
  const existing = overrides.get()[feature];
  return existing && existing.debateId === debateId ? existing : { debateId, sources: {}, outputs: {} };
}

/** Includes or leaves out one source for the feature's next request. */
export function setSourceChoice(feature: DebateContextFeature, debateId: string, sourceId: string, include: boolean) {
  const override = ensureOverride(feature, debateId);
  overrides.set({ ...overrides.get(), [feature]: { ...override, sources: { ...override.sources, [sourceId]: include } } });
  emit();
}

/** Includes or leaves out one saved result for the feature's next request. */
export function setOutputChoice(feature: DebateContextFeature, debateId: string, ref: DebateOutputRef, include: boolean) {
  const override = ensureOverride(feature, debateId);
  overrides.set({ ...overrides.get(), [feature]: { ...override, outputs: { ...override.outputs, [outputKey(ref)]: include } } });
  emit();
}

export function hasContextChoices(feature: DebateContextFeature): boolean {
  return Boolean(overrides.get()[feature]);
}

/** Review choices cover one request (or one Crossfire round); the next starts from the automatic selection. */
export function resetContextChoices(feature: DebateContextFeature) {
  if (!overrides.get()[feature]) return;
  const next = { ...overrides.get() };
  delete next[feature];
  overrides.set(next);
  emit();
}

export class PinLimitError extends Error {
  constructor() {
    super('pin_limit');
    this.name = 'PinLimitError';
  }
}

/**
 * Pins or unpins a saved result in its debate, as the website's togglePin:
 * at most three pins count, and only pins on results that still exist.
 */
export async function togglePin(userId: string, debateId: string, ref: DebateOutputRef, resultKeys: ReadonlySet<string>): Promise<void> {
  const held = material.get().get(debateId);
  if (!held) return;
  const key = outputKey(ref);
  const pinned = held.pins.some((pin) => outputKey(pin) === key);
  if (!pinned && held.pins.filter((pin) => resultKeys.has(outputKey(pin))).length >= MAX_PINNED_OUTPUTS) throw new PinLimitError();
  const { error } = pinned
    ? await supabase.from('debate_context_pins').delete().eq('user_id', userId).eq('debate_id', debateId).eq('item_kind', ref.kind).eq('item_id', ref.id)
    : await supabase.from('debate_context_pins').insert({ user_id: userId, debate_id: debateId, item_kind: ref.kind, item_id: ref.id });
  // A pin that already exists is the pin asked for.
  if (error && error.code !== '23505') throw new Error(error.message);
  const latest = material.get().get(debateId);
  if (!latest) return;
  const without = latest.pins.filter((pin) => outputKey(pin) !== key);
  material.get().set(debateId, { ...latest, pins: pinned ? without : [...without, ref] });
  emit();
}
