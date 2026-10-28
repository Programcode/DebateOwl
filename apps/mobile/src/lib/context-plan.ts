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
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { useAuth } from './auth';
import { sessionSlot } from './session-memory';
import { supabase } from './supabase';

/**
 * The Current Debate material a request sends, as the website plans it
 * (packages/core/src/debate/context-plan.ts) with its Review choices and pins
 * (src/lib/stores/debate-context-store.ts): the debate's list of material read
 * when a form opens, the choices for one feature's next request, and the
 * debate's pins in debate_context_pins (three at most). The line on each tool
 * form, its Review sheet and the request itself read the same plan.
 *
 * The list holds titles, sides and dates only. Which items a request includes
 * does not depend on their text, so the text (a source's content, a result's
 * output, a chat's messages) is read only for the items the plan will send,
 * and kept for the session, so the size limits are checked on what is sent.
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

interface ContextMaterial {
  debateId: string;
  sources: PlanSource[];
  results: Partial<Record<ResultKind, PlanResult[]>>;
  sparring: PlanSparringSession[];
  pins: DebateOutputRef[];
}

const material = sessionSlot(() => new Map<string, ContextMaterial>());
/** Text read for items a plan sends, by debate and `source:<id>` or `<kind>:<id>`. */
const texts = sessionSlot(() => new Map<string, unknown>());
const overrides = sessionSlot((): Partial<Record<DebateContextFeature, DebateContextOverride>> => ({}));
/** The latest list read per debate; an older read that ends later is dropped. */
const loads = new Map<string, number>();
/** Pin changes per debate, so a list read that started before one keeps the newer pins. */
const pinEdits = new Map<string, number>();
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
const textKey = (debateId: string, key: string) => `${debateId}|${key}`;

/**
 * Reads a debate's list of material: its sources, saved results and judged
 * Sparring rounds, without their text, and its pins. Every read filters on
 * the user; row level security is the real boundary. Pins are optional: if
 * they cannot be read, the automatic selection is used.
 */
export async function loadContextMaterial(userId: string, debateId: string): Promise<ContextMaterial> {
  const load = (loads.get(debateId) ?? 0) + 1;
  loads.set(debateId, load);
  const pinsAtStart = pinEdits.get(debateId) ?? 0;
  const [sources, pins, sparring, chats, ...results] = await Promise.all([
    supabase.from('sources').select('id,title,type,is_active').eq('user_id', userId).eq('debate_id', debateId).order('created_at', { ascending: false }),
    supabase.from('debate_context_pins').select('item_kind,item_id').eq('user_id', userId).eq('debate_id', debateId),
    supabase.from('sparring_sessions').select('id,motion,user_side,updated_at').eq('user_id', userId).eq('debate_id', debateId),
    supabase.from('chats').select('id,title,side,created_at').eq('user_id', userId).eq('debate_id', debateId),
    ...RESULT_KINDS.map((kind) => supabase.from(RESULT_TABLES[kind]).select('id,title,side,created_at').eq('user_id', userId).eq('debate_id', debateId)),
  ]);
  // A newer read started meanwhile: it decides.
  const superseded = material.get().get(debateId);
  if (loads.get(debateId) !== load && superseded) return superseded;
  const resultRow = (row: { id: string; title: string; side: string | null; created_at: string }): PlanResult => ({
    id: row.id,
    title: row.title,
    side: row.side,
    debateId,
    createdAt: time(row.created_at),
    data: undefined,
  });
  const loadedPins = pins.error
    ? []
    : ((pins.data ?? []) as { item_kind: unknown; item_id: unknown }[]).flatMap((row) =>
        isDebateContextOutputKind(row.item_kind) && typeof row.item_id === 'string' ? [{ kind: row.item_kind, id: row.item_id }] : []);
  const held = material.get().get(debateId);
  const next: ContextMaterial = {
    debateId,
    sources: rowsOf<{ id: string; title: string; type: string | null; is_active: boolean }>(sources).map((row) => ({
      id: row.id,
      title: row.title,
      content: '',
      type: row.type ?? 'text',
      debateId,
      isActive: row.is_active,
    })),
    results: { chat: rowsOf<{ id: string; title: string; side: string | null; created_at: string }>(chats).map(resultRow) },
    sparring: rowsOf<{ id: string; motion: string; user_side: string | null; updated_at: string }>(sparring).map((row) => ({
      id: row.id,
      motion: row.motion,
      debateId,
      userSide: row.user_side,
      updatedAt: time(row.updated_at),
    })),
    // A pin changed while this read ran is newer than what the read saw.
    pins: held && (pinEdits.get(debateId) ?? 0) !== pinsAtStart ? held.pins : loadedPins,
  };
  RESULT_KINDS.forEach((kind, index) => {
    next.results[kind] = rowsOf<{ id: string; title: string; side: string | null; created_at: string }>(results[index]).map(resultRow);
  });
  material.get().set(debateId, next);
  // Text kept as "nothing usable yet" (an unjudged round, a chat with no messages) is read again.
  for (const [key, value] of texts.get()) {
    if (!key.startsWith(`${debateId}|`)) continue;
    const unjudged = key.includes('|sparring:') && !(value as { scorecard?: unknown } | undefined)?.scorecard;
    const emptyChat = key.includes('|chat:') && Array.isArray(value) && value.length === 0;
    if (unjudged || emptyChat) texts.get().delete(key);
  }
  emit();
  return next;
}

/** Reads the text of the given items (`source:<id>` or `<kind>:<id>`) into the session's store. */
async function loadTexts(userId: string, debateId: string, keys: string[]): Promise<void> {
  const ids = (prefix: string) => keys.filter((key) => key.startsWith(`${prefix}:`)).map((key) => key.slice(prefix.length + 1));
  const reads: PromiseLike<void>[] = [];
  const keep = (key: string, value: unknown) => texts.get().set(textKey(debateId, key), value);
  const sourceIds = ids('source');
  if (sourceIds.length > 0) {
    reads.push(supabase.from('sources').select('id,content').eq('user_id', userId).in('id', sourceIds).then((result) => {
      for (const row of rowsOf<{ id: string; content: string | null }>(result)) keep(`source:${row.id}`, row.content ?? '');
    }));
  }
  for (const kind of RESULT_KINDS) {
    const kindIds = ids(kind);
    if (kindIds.length === 0) continue;
    reads.push(supabase.from(RESULT_TABLES[kind]).select('id,output').eq('user_id', userId).in('id', kindIds).then((result) => {
      for (const row of rowsOf<{ id: string; output: unknown }>(result)) keep(`${kind}:${row.id}`, row.output);
    }));
  }
  // Messages have no user column; the chat ids come from the user's own list.
  const chatIds = ids('chat');
  if (chatIds.length > 0) {
    reads.push(supabase.from('messages').select('chat_id,role,content').in('chat_id', chatIds).order('created_at', { ascending: true }).then((result) => {
      const byChat = new Map<string, { role: string; content: string }[]>(chatIds.map((id) => [id, []]));
      for (const row of rowsOf<{ chat_id: string; role: string; content: string }>(result)) byChat.get(row.chat_id)?.push({ role: row.role, content: row.content });
      byChat.forEach((messages, id) => keep(`chat:${id}`, messages));
    }));
  }
  const sparringIds = ids('sparring');
  if (sparringIds.length > 0) {
    reads.push(supabase.from('sparring_sessions').select('id,user_side,final_evaluation').eq('user_id', userId).in('id', sparringIds).then((result) => {
      for (const row of rowsOf<{ id: string; user_side: unknown; final_evaluation: unknown }>(result)) {
        keep(`sparring:${row.id}`, { userSide: row.user_side, scorecard: row.final_evaluation });
      }
    }));
  }
  await Promise.all(reads);
  emit();
}

interface PlanOptions {
  /** The chat open in Ask is already the conversation. */
  excludeChatId?: string | null;
  /** False when the request reads no Library sources, as Crossfire with grounding off. */
  includeSources?: boolean;
}

/**
 * The plan, once the text of every item it sends is known; otherwise the
 * items whose text is still to be read.
 */
function planFor(held: ContextMaterial, feature: DebateContextFeature, side: DebateContextSide, options: PlanOptions): { plan: DebateContextPlan } | { missing: string[] } {
  const known = texts.get();
  const text = (key: string) => known.get(textKey(held.debateId, key));
  const inputs = {
    sourceLibrary: held.sources.map((source) => ({ ...source, content: (text(`source:${source.id}`) as string | undefined) ?? '' })),
    results: Object.fromEntries(
      Object.entries(held.results).map(([kind, rows]) => [kind, rows?.map((row) => ({ ...row, data: text(`${kind}:${row.id}`) }))]),
    ) as ContextMaterial['results'],
    sparringSessions: held.sparring.map((session) => {
      const saved = text(`sparring:${session.id}`) as { userSide?: unknown; scorecard?: unknown } | undefined;
      return { ...session, scorecard: saved?.scorecard };
    }),
    pins: held.pins,
    override: overrides.get()[feature],
    excludeChatId: options.excludeChatId ?? null,
  };
  const plan = planDebateContext(feature, side, held.debateId, inputs, { includeSources: options.includeSources });
  // Which items are sent does not depend on their text; their size and emptiness do.
  const sent = [
    ...plan.sources.filter((source) => source.included && !source.overLimit).map((source) => `source:${source.id}`),
    ...plan.outputs.filter((output) => output.included && !output.overLimit).map((output) => outputKey(output.ref)),
  ];
  const missing = sent.filter((key) => !known.has(textKey(held.debateId, key)));
  return missing.length > 0 ? { missing } : { plan };
}

/** The plan for a request about to be sent, from the list read now. */
export async function planRequest(userId: string, debateId: string, feature: DebateContextFeature, side: DebateContextSide, options: PlanOptions = {}): Promise<DebateContextPlan> {
  const held = await loadContextMaterial(userId, debateId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = planFor(held, feature, side, options);
    if ('plan' in result) return result.plan;
    await loadTexts(userId, debateId, result.missing);
  }
  throw new Error('Could not read the debate context');
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
  const result = useMemo(() => {
    const held = debateId ? material.get().get(debateId) : undefined;
    return held ? planFor(held, feature, side, { excludeChatId, includeSources }) : null;
    // `current` changes whenever the list, a text, a choice or a pin does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, debateId, feature, side, excludeChatId, includeSources]);
  const missing = result && 'missing' in result ? result.missing.join(',') : '';
  useEffect(() => {
    if (!missing || !userId || !debateId) return;
    loadTexts(userId, debateId, missing.split(',')).catch((cause: unknown) => console.warn('Could not read the debate context:', cause instanceof Error ? cause.message : cause));
  }, [missing, userId, debateId]);
  // While a newly chosen item's text is read, the last whole plan for this debate stays on screen.
  const last = useRef<DebateContextPlan | null>(null);
  if (result && 'plan' in result) last.current = result.plan;
  return last.current?.debateId === debateId ? last.current : null;
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
  pinEdits.set(debateId, (pinEdits.get(debateId) ?? 0) + 1);
  const latest = material.get().get(debateId);
  if (!latest) return;
  const without = latest.pins.filter((pin) => outputKey(pin) !== key);
  material.get().set(debateId, { ...latest, pins: pinned ? without : [...without, ref] });
  emit();
}
