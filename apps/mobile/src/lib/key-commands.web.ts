import { useEffect, useRef } from 'react';

export type KeyCombo = 'cmd+n' | 'cmd+k' | 'cmd+enter';

function matches(event: KeyboardEvent, combo: KeyCombo): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (combo === 'cmd+enter') return event.key === 'Enter';
  return event.key.toLowerCase() === combo.slice(-1);
}

/** The iPad's ⌘ shortcuts in the web preview, from the same hook the native app calls (key-commands.ts). */
export function useKeyCommand(combo: KeyCombo, handler: () => void, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!matches(event, combo)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}
