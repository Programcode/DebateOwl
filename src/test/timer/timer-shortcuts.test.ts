import { describe, expect, it } from 'vitest';
import { timerShortcutBlocked } from '@/lib/timer-shortcuts';

function key(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('timer shortcuts', () => {
  it('lets a bare key through when nothing else is focused', () => {
    expect(timerShortcutBlocked(key(document.body, { code: 'Space' }))).toBe(false);
  });

  it('stays out of buttons, selects, menus, and keys a control already handled', () => {
    const button = document.createElement('button');
    document.body.append(button);
    expect(timerShortcutBlocked(key(button, { code: 'Space' }))).toBe(true);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    menu.append(item);
    document.body.append(menu);
    expect(timerShortcutBlocked(key(item, { code: 'Escape' }))).toBe(true);

    const consumed = key(document.body, { code: 'Escape' });
    consumed.preventDefault();
    expect(timerShortcutBlocked(consumed)).toBe(true);

    const modified = key(document.body, { code: 'ArrowRight', ctrlKey: true });
    expect(timerShortcutBlocked(modified)).toBe(true);
  });
});
