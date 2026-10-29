import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { comboForKey, createKeyCommandRegistry, type KeyCombo } from './key-command-registry';

export type { KeyCombo } from './key-command-registry';

const registry = createKeyCommandRegistry();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', (event) => {
    const combo = comboForKey(event);
    if (combo && registry.dispatch(combo)) event.preventDefault();
  });
}

/** The iPad's ⌘ shortcuts in the web preview, from the same hook and registry the native app uses (key-commands.ts). */
export function useKeyCommand(combo: KeyCombo, handler: () => void, enabled = true): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    listen();
    return registry.register(combo, () => latest.current());
  }, [combo, enabled]);
}

/** useKeyCommand for a screen: it listens only while the screen is in view, never from under the one above it. */
export function useFocusedKeyCommand(combo: KeyCombo, handler: () => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useFocusEffect(
    useCallback(() => {
      listen();
      return registry.register(combo, () => latest.current());
    }, [combo]),
  );
}
