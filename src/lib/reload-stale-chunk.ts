const RELOAD_PREFIX = 'debatelab-stale-chunk:';

type ReloadTarget = Pick<Window, 'addEventListener' | 'sessionStorage' | 'location'> & {
  navigator: Pick<Navigator, 'onLine'>;
};

let reloadRequested = false;

/** Whether this page has already asked for a stale-chunk reload that has not landed yet. */
export function staleChunkReloadPending(): boolean {
  return reloadRequested;
}

/** Test hook: forget a reload this page asked for. */
export function resetStaleChunkReloadForTests(): void {
  reloadRequested = false;
}

/**
 * Reloads the page once per path for a chunk the deployed build no longer has.
 * Returns whether a reload was started. A second failure on the same path
 * stays put, so a missing file cannot refresh the tab forever. Offline the
 * chunk is not stale, only unreachable: a reload could replace the page with
 * the browser's offline error, so the error stands instead.
 */
export function reloadOnceForStaleChunk(target: ReloadTarget = window): boolean {
  if (reloadRequested) return true;
  if (target.navigator.onLine === false) return false;
  const key = `${RELOAD_PREFIX}${target.location.pathname || '/'}`;
  try {
    if (target.sessionStorage.getItem(key) === '1') return false;
    target.sessionStorage.setItem(key, '1');
  } catch {
    return false;
  }
  reloadRequested = true;
  target.location.reload();
  return true;
}

/**
 * After a deploy, an open tab can ask for a chunk the new build no longer has.
 * Reload once so the fresh document loads the new names. Vite then resolves
 * the prevented import to undefined, which loadChunk (lazy-chunk.ts) holds
 * until the reload lands.
 */
export function installStaleChunkReload(target: ReloadTarget = window): void {
  target.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForStaleChunk(target)) event.preventDefault();
  });
}
