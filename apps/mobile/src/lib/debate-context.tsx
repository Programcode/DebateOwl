import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { publishCurrentDebate } from './debate-widget';
import { useAuth } from './auth';
import {
  continueDebate,
  createDebate,
  deleteDebate,
  fetchDebates,
  sortDebates,
  switchDebate,
  updateDebate,
  type Debate,
  type DebateSettings,
} from './debates';
import { keepIfSame } from './keep-if-same';

type Status = 'loading' | 'ready' | 'error';

type DebateContextValue = {
  status: Status;
  debates: Debate[];
  current: Debate | null;
  /** Session-only, as on the website: tools run without reading from or saving to any debate. */
  oneOff: boolean;
  /** The debate that new work attaches to right now, or null for one-off work. */
  activeDebateId: string | null;
  refresh: () => Promise<void>;
  create: (input: { motion: string; settings: DebateSettings; instructions?: string }) => Promise<Debate>;
  switchTo: (id: string) => Promise<void>;
  /** The website's Edit settings: motion, format, role, judge and instructions. */
  update: (id: string, patch: { motion?: string; settings?: DebateSettings; instructions?: string }) => Promise<void>;
  /** Deletes a debate with its sources and saved work. */
  remove: (id: string) => Promise<void>;
  /** "Continue" in the five-day check. */
  continueCurrent: () => Promise<void>;
  setOneOff: (oneOff: boolean) => void;
  /** After Delete all my data: drops this account's debates and Current Debate here, whether or not a reload works. */
  forgetDebates: (userId: string) => void;
};

const DebateContext = createContext<DebateContextValue | null>(null);

export function DebateProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<Status>('loading');
  const [debates, setDebates] = useState<Debate[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [oneOff, setOneOff] = useState(false);
  // A load that started before a create or switch must not overwrite it, only
  // the latest of overlapping loads may land, and nothing from a previous
  // owner may land after a sign-out or account switch. The generation is
  // bumped on every owner change, so work started before signing out and back
  // in as the same account does not land either.
  const writes = useRef(0);
  const refreshes = useRef(0);
  const owner = useRef(userId);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const forUser = owner.current;
    if (!forUser) return;
    const writesBefore = writes.current;
    const request = ++refreshes.current;
    try {
      const next = await fetchDebates(forUser);
      if (owner.current !== forUser || refreshes.current !== request || writes.current !== writesBefore) return;
      // Refreshes run on every Debate tab focus; an unchanged list keeps its identity so the tabs do not re-render.
      setDebates((previous) => keepIfSame(previous, next.debates));
      setCurrentId(next.currentId);
      setStatus('ready');
    } catch (cause) {
      if (owner.current !== forUser || refreshes.current !== request) return;
      console.warn('Could not load debates:', cause instanceof Error ? cause.message : cause);
      // Keep what is on screen; only an empty first load becomes an error.
      setStatus((previous) => (previous === 'ready' ? previous : 'error'));
    }
  }, []);

  useEffect(() => {
    owner.current = userId;
    generation.current += 1;
    setDebates([]);
    setCurrentId(null);
    setOneOff(false);
    setStatus('loading');
    if (!userId) return;
    void refresh();
    // Pick up debates started or switched on the website while the app was in the background.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [userId, refresh]);

  // The Home Screen widget shows the Current Debate (a no-op in Expo Go); the Debate tab adds its counts.
  const currentMotion = debates.find((debate) => debate.id === currentId)?.motion ?? null;
  useEffect(() => {
    publishCurrentDebate(userId && currentId && currentMotion ? { debateId: currentId, motion: currentMotion, counts: null } : null);
  }, [userId, currentId, currentMotion]);

  const value = useMemo<DebateContextValue>(() => {
    const current = debates.find((debate) => debate.id === currentId) ?? null;
    return {
      status,
      debates,
      current,
      oneOff,
      activeDebateId: oneOff ? null : current?.id ?? null,
      refresh,
      // The account is read when the student acts. If the owner changed while
      // the write ran, the write still happened for that account, so it is
      // reported as done but not shown to whoever is signed in now.
      create: async ({ motion, settings, instructions }) => {
        const forUser = owner.current;
        if (!forUser) throw new Error('Sign in to manage debates');
        const gen = generation.current;
        const debate = await createDebate(forUser, { motion, settings, instructions });
        if (generation.current !== gen) return debate;
        writes.current += 1;
        setDebates((previous) => sortDebates([debate, ...previous.filter((item) => item.id !== debate.id)]));
        setCurrentId(debate.id);
        setOneOff(false);
        setStatus('ready');
        return debate;
      },
      switchTo: async (id) => {
        const forUser = owner.current;
        if (!forUser) throw new Error('Sign in to manage debates');
        const gen = generation.current;
        const at = await switchDebate(forUser, id);
        if (generation.current !== gen) return;
        writes.current += 1;
        setDebates((previous) => sortDebates(previous.map((item) => (item.id === id ? { ...item, lastActivityAt: at } : item))));
        setCurrentId(id);
        setOneOff(false);
      },
      update: async (id, patch) => {
        const forUser = owner.current;
        const debate = debates.find((item) => item.id === id);
        if (!forUser || !debate) throw new Error('Debate not found');
        const gen = generation.current;
        const next = await updateDebate(forUser, debate, patch);
        if (generation.current !== gen) return;
        writes.current += 1;
        setDebates((previous) => previous.map((item) => (item.id === id ? next : item)));
      },
      remove: async (id) => {
        const forUser = owner.current;
        if (!forUser) throw new Error('Sign in to manage debates');
        const gen = generation.current;
        await deleteDebate(forUser, id);
        if (generation.current !== gen) return;
        writes.current += 1;
        setDebates((previous) => previous.filter((item) => item.id !== id));
        setCurrentId((previous) => (previous === id ? null : previous));
      },
      continueCurrent: async () => {
        const forUser = owner.current;
        if (!forUser || !currentId) return;
        const gen = generation.current;
        const id = currentId;
        const at = await continueDebate(forUser, id);
        if (generation.current !== gen) return;
        writes.current += 1;
        setDebates((previous) => sortDebates(previous.map((item) => (item.id === id ? { ...item, lastActivityAt: Math.max(item.lastActivityAt, at) } : item))));
      },
      setOneOff,
      forgetDebates: (forUser) => {
        if (owner.current !== forUser) return;
        // A load that started before the delete must not bring the deleted debates back.
        writes.current += 1;
        setDebates([]);
        setCurrentId(null);
        setOneOff(false);
        setStatus('ready');
      },
    };
  }, [status, debates, currentId, oneOff, refresh]);

  return <DebateContext.Provider value={value}>{children}</DebateContext.Provider>;
}

export function useDebates(): DebateContextValue {
  const value = useContext(DebateContext);
  if (!value) throw new Error('useDebates must be used inside DebateProvider');
  return value;
}
