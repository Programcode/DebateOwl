import { useEffect } from 'react';

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = `${e.metaKey || e.ctrlKey ? 'mod+' : ''}${e.key.toLowerCase()}`;
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
