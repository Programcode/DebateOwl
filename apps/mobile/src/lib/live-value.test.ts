import { describe, expect, it, vi } from 'vitest';

import { createLiveValue } from './live-value';

describe('createLiveValue', () => {
  it('tells subscribers about each change, with updates applied in order', () => {
    const value = createLiveValue<string | null>(null);
    const listener = vi.fn();
    value.subscribe(listener);
    value.set('');
    value.set((previous) => `${previous ?? ''}Sugar `);
    value.set((previous) => `${previous ?? ''}taxes`);
    expect(value.get()).toBe('Sugar taxes');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('stays quiet when the value does not change', () => {
    const value = createLiveValue(5);
    const listener = vi.fn();
    value.subscribe(listener);
    value.set(5);
    value.set((previous) => previous);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops telling a listener once it unsubscribes', () => {
    const value = createLiveValue(0);
    const listener = vi.fn();
    const stop = value.subscribe(listener);
    stop();
    value.set(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
