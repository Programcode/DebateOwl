import { useEffect } from 'react';

/** Keeps the screen awake while `active`, taking the lock again when the tab returns. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((sentinel) => {
        if (released) void sentinel.release();
        else lock = sentinel;
      }).catch(() => { /* Not allowed here (battery saver, iframe): the timer still works. */ });
    };
    acquire();
    // The browser drops the lock when the tab hides; take it again on return.
    document.addEventListener('visibilitychange', acquire);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
