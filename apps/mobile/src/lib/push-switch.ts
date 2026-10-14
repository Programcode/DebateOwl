import type { PushState } from './push';

export type PushSwitchView = { state: PushState | null; busy: boolean; failed: boolean };

/**
 * Orders the notification switch's reads and changes. The newest read or
 * change may show its state, so an older answer never overwrites a newer one.
 * Only the newest change owns `busy` and `failed`: a read that starts while a
 * change runs (the app coming back to the foreground) must not leave the
 * switch busy or hide the change's failure.
 */
export function createPushSwitch(show: (patch: Partial<PushSwitchView>) => void) {
  let latest = 0;
  let latestChange = 0;

  return {
    load(read: () => Promise<PushState>): void {
      const id = ++latest;
      read().then(
        (state) => {
          if (id === latest) show({ state });
        },
        (cause: unknown) => console.warn('Could not read the notification state:', cause instanceof Error ? cause.message : cause),
      );
    },

    change(write: () => Promise<PushState>): void {
      const id = ++latest;
      latestChange = id;
      show({ busy: true, failed: false });
      write().then(
        (state) => {
          if (id === latest) show({ state });
          if (id === latestChange) show({ busy: false });
        },
        (cause: unknown) => {
          console.warn('Could not change notifications:', cause instanceof Error ? cause.message : cause);
          if (id === latestChange) show({ busy: false, failed: true });
        },
      );
    },
  };
}
