const RELOAD_PREFIX = 'debatelab-stale-chunk:';

type ReloadTarget = Pick<Window, 'addEventListener' | 'sessionStorage' | 'location'>;

/**
 * After a deploy, an open tab can ask for a chunk the new build no longer has.
 * Reload once so the fresh document loads the new names. A second failure on
 * the same path stays put, so a missing file cannot refresh the tab forever.
 */
export function installStaleChunkReload(target: ReloadTarget = window): void {
  target.addEventListener('vite:preloadError', (event) => {
    const path = target.location.pathname || '/';
    const key = `${RELOAD_PREFIX}${path}`;
    let alreadyReloaded = false;
    try {
      alreadyReloaded = target.sessionStorage.getItem(key) === '1';
      if (!alreadyReloaded) target.sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    if (alreadyReloaded) return;
    event.preventDefault();
    target.location.reload();
  });
}
