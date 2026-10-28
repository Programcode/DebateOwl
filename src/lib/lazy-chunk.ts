import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { reloadOnceForStaleChunk, staleChunkReloadPending } from './reload-stale-chunk';

// What Chromium, Firefox and Safari say when a dynamic import's file is gone,
// and Vite's own preload failure.
const CHUNK_ERROR_MARKERS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return CHUNK_ERROR_MARKERS.some((marker) => message.includes(marker));
}

/** A chunk that loaded as nothing and could not be reloaded. Named for the route error boundary and Sentry. */
class ChunkLoadError extends Error {
  constructor() {
    super('A page file did not load.');
    this.name = 'ChunkLoadError';
  }
}

// Holds Suspense on its fallback while the page reloads.
const untilReload = <T>(): Promise<T> => new Promise<T>(() => undefined);

/**
 * Loads a code-split module so a deploy cannot crash the page that asked for it.
 * After a deploy the old file can be gone. Vite's preload listener
 * (reload-stale-chunk.ts) then reloads the page and Vite resolves the import
 * to undefined, so the caller would destructure nothing: the /login crash
 * "(destructured parameter) is undefined". Here the import waits for that
 * reload instead. A failed import reloads once per path the same way. A second
 * failure, or one while offline, reaches the caller as an error.
 */
export function loadChunk<T>(load: () => Promise<T | null | undefined>, reload: () => boolean = reloadOnceForStaleChunk): Promise<T> {
  return Promise.resolve().then(load).then((module) => {
    if (module) return module;
    if (staleChunkReloadPending() || reload()) return untilReload<T>();
    throw new ChunkLoadError();
  }, (error: unknown) => {
    if (isChunkLoadError(error) && reload()) return untilReload<T>();
    throw error;
  });
}

/** One named export of a code-split module, as a lazy component's `{ default }`. */
export function namedChunk<M, K extends keyof M>(load: () => Promise<M | null | undefined>, name: K): Promise<{ default: M[K] }> {
  return loadChunk(load).then((module) => ({ default: module[name] }));
}

/** React.lazy through loadChunk. Every lazy component in the app goes through here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound React.lazy uses.
export function lazyChunk<C extends ComponentType<any>>(load: () => Promise<{ default: C } | null | undefined>): LazyExoticComponent<C> {
  return lazy(() => loadChunk(load));
}
