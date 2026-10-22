import { describe, expect, it, vi } from 'vitest';

import type { PushState } from './push';
import { createPushSwitch, type PushSwitchView } from './push-switch';

function deferred() {
  let resolve!: (state: PushState) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<PushState>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function view() {
  let current: PushSwitchView = { state: null, busy: false, failed: false };
  const pushSwitch = createPushSwitch((patch) => (current = { ...current, ...patch }));
  return { pushSwitch, current: () => current };
}

describe('createPushSwitch', () => {
  it('frees the switch when the app comes back to the foreground during a change', async () => {
    const { pushSwitch, current } = view();
    const write = deferred();
    pushSwitch.change(() => write.promise);
    expect(current().busy).toBe(true);

    // Foregrounding reloads; the read is queued behind the change, so it answers after it.
    const read = deferred();
    pushSwitch.load(() => read.promise);
    write.resolve('on');
    await vi.waitFor(() => expect(current().busy).toBe(false));
    read.resolve('on');
    await vi.waitFor(() => expect(current()).toEqual({ state: 'on', busy: false, failed: false }));
  });

  it('still reports a failed change when a read started during it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pushSwitch, current } = view();
    const write = deferred();
    pushSwitch.change(() => write.promise);
    pushSwitch.load(() => Promise.resolve('off'));
    write.reject(new Error('offline'));
    await vi.waitFor(() => expect(current()).toEqual({ state: 'off', busy: false, failed: true }));
  });
});
