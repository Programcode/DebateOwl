import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { initialSession, parseSavedFormats, parseSession, serializeSession, upsertSavedFormat, type SavedFormat, type TimerSession } from './timer';

// The timer's round and the custom formats saved on this device, as the
// website keeps its round in localStorage. Not tied to an account: a timer
// holds no debate content. The screen, the format sheet and the Live
// Activity read the same state.

const SESSION_KEY = 'debatelab.timer.session';
const FORMATS_KEY = 'debatelab.timer.formats';

interface TimerStoreState {
  loaded: boolean;
  session: TimerSession;
  saved: SavedFormat[];
}

let state: TimerStoreState = { loaded: false, session: initialSession(), saved: [] };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch((cause: unknown) =>
    // The timer still works; it just will not survive a restart.
    console.warn('Could not keep the timer:', cause instanceof Error ? cause.message : cause));
}

async function readJson(key: string): Promise<unknown> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');
  } catch {
    return null;
  }
}

/** Reads the stored round and formats once; later calls share the first read. */
export function loadTimer(): Promise<void> {
  loading ??= (async () => {
    const [session, saved] = await Promise.all([readJson(SESSION_KEY), readJson(FORMATS_KEY)]);
    // A change made before the read finished (a tap on a fresh screen) wins over the stored round.
    state = {
      loaded: true,
      session: state.loaded ? state.session : parseSession(session) ?? state.session,
      saved: state.loaded ? state.saved : parseSavedFormats(saved),
    };
    emit();
  })();
  return loading;
}

export function getTimer(): TimerStoreState {
  return state;
}

export function updateSession(change: (current: TimerSession) => TimerSession) {
  const next = change(state.session);
  if (next === state.session) return;
  state = { ...state, loaded: true, session: next };
  persist(SESSION_KEY, serializeSession(next));
  emit();
}

export function saveFormat(entry: SavedFormat) {
  state = { ...state, saved: upsertSavedFormat(state.saved, entry) };
  persist(FORMATS_KEY, state.saved);
  emit();
}

export function deleteSavedFormat(id: string) {
  state = { ...state, saved: state.saved.filter((item) => item.id !== id) };
  persist(FORMATS_KEY, state.saved);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTimerStore(): TimerStoreState {
  return useSyncExternalStore(subscribe, getTimer, getTimer);
}
