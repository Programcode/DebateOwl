import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';
import {
  createDebate,
  fetchDebates,
  sortDebates,
  switchDebate,
  type Debate,
  type DebateSettings,
} from './debates';

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
  create: (input: { motion: string; settings: DebateSettings }) => Promise<Debate>;
  switchTo: (id: string) => Promise<void>;
  setOneOff: (oneOff: boolean) => void;
};

const DebateContext = createContext<DebateContextValue | null>(null);

export function DebateProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<Status>('loading');
  const [debates, setDebates] = useState<Debate[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [oneOff, setOneOff] = useState(false);
  // A load that started before a create or switch must not overwrite it, and
  // nothing from a previous account may land after a sign-out.
  const writes = useRef(0);
  const owner = useRef(userId);

  const refresh = useCallback(async () => {
    const forUser = owner.current;
    if (!forUser) return;
    const writesBefore = writes.current;
    try {
      const next = await fetchDebates();
      if (owner.current !== forUser || writes.current !== writesBefore) return;
      setDebates(next.debates);
      setCurrentId(next.currentId);
      setStatus('ready');
    } catch (cause) {
      if (owner.current !== forUser) return;
      console.warn('Could not load debates:', cause instanceof Error ? cause.message : cause);
      // Keep what is on screen; only an empty first load becomes an error.
      setStatus((previous) => (previous === 'ready' ? previous : 'error'));
    }
  }, []);

  useEffect(() => {
    owner.current = userId;
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

  const value = useMemo<DebateContextValue>(() => {
    const current = debates.find((debate) => debate.id === currentId) ?? null;
    return {
      status,
      debates,
      current,
      oneOff,
      activeDebateId: oneOff ? null : current?.id ?? null,
      refresh,
      create: async ({ motion, settings }) => {
        if (!userId) throw new Error('Sign in to manage debates');
        const debate = await createDebate(userId, { motion, settings });
        writes.current += 1;
        setDebates((previous) => sortDebates([debate, ...previous.filter((item) => item.id !== debate.id)]));
        setCurrentId(debate.id);
        setOneOff(false);
        setStatus('ready');
        return debate;
      },
      switchTo: async (id) => {
        if (!userId) throw new Error('Sign in to manage debates');
        const at = await switchDebate(userId, id);
        writes.current += 1;
        setDebates((previous) => sortDebates(previous.map((item) => (item.id === id ? { ...item, lastActivityAt: at } : item))));
        setCurrentId(id);
        setOneOff(false);
      },
      setOneOff,
    };
  }, [status, debates, currentId, oneOff, userId, refresh]);

  return <DebateContext.Provider value={value}>{children}</DebateContext.Provider>;
}

export function useDebates(): DebateContextValue {
  const value = useContext(DebateContext);
  if (!value) throw new Error('useDebates must be used inside DebateProvider');
  return value;
}
