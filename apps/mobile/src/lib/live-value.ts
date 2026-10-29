import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * A value that changes many times a second (an answer streaming in, a clock)
 * kept outside React state, so only the small components that show it render
 * again, never the whole screen around them. A screen subscribes to a coarse
 * reading (`useLiveValue(value, select)`) when it needs one, such as whether
 * any text has arrived; it then renders only when that reading changes.
 */
export type LiveValue<T> = {
  get: () => T;
  set: (next: T | ((previous: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLiveValue<T>(initial: T): LiveValue<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** One live value for the component's lifetime. */
export function useLiveValueStore<T>(initial: T): LiveValue<T> {
  const [store] = useState(() => createLiveValue(initial));
  return store;
}

/** Reads the value, or a reading of it; the component renders again only when that reading changes. */
export function useLiveValue<T, R = T>(store: LiveValue<T>, select?: (value: T) => R): R {
  const read = () => (select ? select(store.get()) : (store.get() as unknown as R));
  return useSyncExternalStore(store.subscribe, read, read);
}

/**
 * The latest value, for effects and callbacks that must not re-run or be
 * recreated when it changes. Written after render, as React Compiler requires.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
