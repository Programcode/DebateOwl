import { describe, expect, it, vi } from 'vitest';

import { comboForKey, createKeyCommandRegistry, isKeyCombo } from './key-command-registry';

const press = (key: string, modifiers: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('comboForKey', () => {
  it('reads ⌘N, ⌘K and ⌘↩, also with Ctrl and a capital letter', () => {
    expect(comboForKey(press('n', { metaKey: true }))).toBe('cmd+n');
    expect(comboForKey(press('K', { metaKey: true }))).toBe('cmd+k');
    expect(comboForKey(press('Enter', { ctrlKey: true }))).toBe('cmd+enter');
  });

  it('ignores plain keys, other letters and extra modifiers', () => {
    expect(comboForKey(press('n'))).toBeNull();
    expect(comboForKey(press('Enter'))).toBeNull();
    expect(comboForKey(press('j', { metaKey: true }))).toBeNull();
    expect(comboForKey(press('n', { metaKey: true, shiftKey: true }))).toBeNull();
    expect(comboForKey(press('k', { metaKey: true, altKey: true }))).toBeNull();
  });
});

describe('isKeyCombo', () => {
  it('accepts only the three combos the native module may send', () => {
    expect(isKeyCombo('cmd+enter')).toBe(true);
    expect(isKeyCombo('cmd+q')).toBe(false);
    expect(isKeyCombo(undefined)).toBe(false);
  });
});

describe('createKeyCommandRegistry', () => {
  it('runs only the newest handler for a combo, and the older one again once the newer leaves', () => {
    const registry = createKeyCommandRegistry();
    const below = vi.fn();
    const above = vi.fn();
    registry.register('cmd+enter', below);
    const leave = registry.register('cmd+enter', above);

    expect(registry.dispatch('cmd+enter')).toBe(true);
    expect(above).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();

    leave();
    registry.dispatch('cmd+enter');
    expect(below).toHaveBeenCalledTimes(1);
    expect(above).toHaveBeenCalledTimes(1);
  });

  it('keeps combos apart and reports a press nobody listens for', () => {
    const registry = createKeyCommandRegistry();
    const fresh = vi.fn();
    registry.register('cmd+n', fresh);
    expect(registry.dispatch('cmd+k')).toBe(false);
    expect(fresh).not.toHaveBeenCalled();
  });

  it('tells subscribers only when the set of combos changes, in a fixed order', () => {
    const registry = createKeyCommandRegistry();
    const seen: string[][] = [];
    registry.subscribe((active) => seen.push(active));
    const a = registry.register('cmd+enter', () => undefined);
    const b = registry.register('cmd+n', () => undefined);
    const c = registry.register('cmd+n', () => undefined);
    b();
    c();
    a();
    expect(seen).toEqual([['cmd+enter'], ['cmd+n', 'cmd+enter'], ['cmd+enter'], []]);
  });

  it('removes a registration once, even when its cleanup runs twice', () => {
    const registry = createKeyCommandRegistry();
    const kept = vi.fn();
    registry.register('cmd+k', kept);
    const leave = registry.register('cmd+k', () => undefined);
    leave();
    leave();
    registry.dispatch('cmd+k');
    expect(kept).toHaveBeenCalledTimes(1);
    expect(registry.active()).toEqual(['cmd+k']);
  });
});
