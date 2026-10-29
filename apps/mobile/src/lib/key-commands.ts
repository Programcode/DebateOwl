import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import i18n from 'i18next';
import { useCallback, useEffect, useRef } from 'react';

import { createKeyCommandRegistry, isKeyCombo, KEY_COMMAND_SPECS, type KeyCombo } from './key-command-registry';
import { nativeCapabilities } from './native-capabilities';

export type { KeyCombo } from './key-command-registry';

/**
 * iPad hardware-keyboard shortcuts (⌘N, ⌘K, ⌘↩) through the app's own module,
 * modules/key-commands (UIKeyCommand, with titles for the ⌘ overlay). It is in
 * development builds only; Expo Go and a build without it register nothing.
 * The web preview has key-commands.web.ts.
 */

type KeyCommandsModule = {
  setCommands: (commands: { id: KeyCombo; input: string; title: string }[]) => void;
  addListener: (event: 'onKeyCommand', listener: (event: { id?: unknown }) => void) => { remove: () => void };
};

const registry = createKeyCommandRegistry();
let started = false;

function start() {
  if (started) return;
  started = true;
  if (!nativeCapabilities().keyCommands) return;
  const native = requireOptionalNativeModule<KeyCommandsModule>('DebateOwlKeyCommands');
  if (!native) return;
  native.addListener('onKeyCommand', (event) => {
    if (isKeyCombo(event.id)) registry.dispatch(event.id);
  });
  const publish = () => {
    try {
      native.setCommands(registry.active().map((id) => ({ id, input: KEY_COMMAND_SPECS[id].input, title: i18n.t(KEY_COMMAND_SPECS[id].titleKey) })));
    } catch (cause) {
      console.warn('Could not set the keyboard shortcuts:', cause instanceof Error ? cause.message : cause);
    }
  };
  registry.subscribe(publish);
  // The ⌘ overlay's titles follow the app's language.
  i18n.on('languageChanged', publish);
  publish();
}

/** Runs `handler` on the combo while `enabled`. Of several screens listening, the newest wins. */
export function useKeyCommand(combo: KeyCombo, handler: () => void, enabled = true): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    start();
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
      start();
      return registry.register(combo, () => latest.current());
    }, [combo]),
  );
}
