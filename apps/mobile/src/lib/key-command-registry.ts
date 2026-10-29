/**
 * The iPad's ⌘ shortcuts, shared by the native module (key-commands.ts) and the
 * web preview (key-commands.web.ts). A combo can be wanted by several screens at
 * once (the root layout's ⌘N under a screen that also listens, Ask above
 * Crossfire in the stack); only the newest enabled registration runs, so one
 * press never acts twice. No React Native or Expo imports, so it is unit-tested
 * in Node.
 */

export type KeyCombo = 'cmd+n' | 'cmd+k' | 'cmd+enter';

/** Every combo, in the order iOS lists them in the ⌘ overlay. */
export const KEY_COMBOS: readonly KeyCombo[] = ['cmd+n', 'cmd+k', 'cmd+enter'];

/** What UIKeyCommand reads: the key's input and the catalog key of the title the ⌘ overlay shows. */
export const KEY_COMMAND_SPECS: Record<KeyCombo, { input: string; titleKey: string }> = {
  'cmd+n': { input: 'n', titleKey: 'mobile.debates.newDebate' },
  'cmd+k': { input: 'k', titleKey: 'debate.switch' },
  'cmd+enter': { input: '\r', titleKey: 'askChat.send' },
};

export function isKeyCombo(value: unknown): value is KeyCombo {
  return typeof value === 'string' && (KEY_COMBOS as readonly string[]).includes(value);
}

/** A keydown as the web preview reports it. */
export type KeyPress = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

/** The combo a key press is, or null: ⌘ (or Ctrl, for the preview on other systems) with no other modifier. */
export function comboForKey(press: KeyPress): KeyCombo | null {
  if (!(press.metaKey || press.ctrlKey) || press.altKey || press.shiftKey) return null;
  if (press.key === 'Enter') return 'cmd+enter';
  const key = press.key.toLowerCase();
  if (key === 'n') return 'cmd+n';
  if (key === 'k') return 'cmd+k';
  return null;
}

export type KeyCommandRegistry = {
  /** Adds a handler; the returned function removes exactly this one. */
  register: (combo: KeyCombo, handler: () => void) => () => void;
  /** Runs the newest handler for the combo. False when nothing listens. */
  dispatch: (combo: KeyCombo) => boolean;
  /** The combos something listens for, in KEY_COMBOS order. */
  active: () => KeyCombo[];
  /** Called whenever `active()` changes. */
  subscribe: (listener: (active: KeyCombo[]) => void) => () => void;
};

export function createKeyCommandRegistry(): KeyCommandRegistry {
  let next = 0;
  const entries: { id: number; combo: KeyCombo; handler: () => void }[] = [];
  const listeners = new Set<(active: KeyCombo[]) => void>();
  const active = () => KEY_COMBOS.filter((combo) => entries.some((entry) => entry.combo === combo));
  let shown = '';
  const changed = () => {
    const now = active();
    const key = now.join(',');
    if (key === shown) return;
    shown = key;
    listeners.forEach((listener) => listener(now));
  };
  return {
    register(combo, handler) {
      const id = ++next;
      entries.push({ id, combo, handler });
      changed();
      return () => {
        const at = entries.findIndex((entry) => entry.id === id);
        if (at === -1) return;
        entries.splice(at, 1);
        changed();
      };
    },
    dispatch(combo) {
      for (let at = entries.length - 1; at >= 0; at -= 1) {
        if (entries[at].combo !== combo) continue;
        entries[at].handler();
        return true;
      }
      return false;
    },
    active,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
