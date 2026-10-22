const JAM_SCRIPT_URLS = [
  'https://js.jam.dev/recorder.js',
  'https://js.jam.dev/capture.js',
] as const;
const JAM_SCRIPT_TIMEOUT_MS = 3_000;

/**
 * Jam stays off the critical path. The capture iframe at recorder.jam.dev
 * keeps a worker request open, so the network never goes idle once the
 * scripts run. Load on the first interaction, and otherwise only after the
 * page has had this long to paint. Callers must not wait for `networkidle`.
 *
 * That iframe is cross-origin. Chrome cannot tell whether it is eligible for
 * the back/forward cache, and an `unload` listener inside it would block the
 * whole page. `pagehide` removes the frame first (it does not block the cache
 * the way `unload` and `beforeunload` do). The frame is not put back when the
 * page is restored: a re-added frame reloads and starts a new handshake, which
 * Jam's already-initialized parent script rejects. Jam stays off on a page
 * restored from the back/forward cache and returns on the next full load.
 */
export const JAM_PASSIVE_DELAY_MS = 8_000;

const JAM_FRAME_SELECTOR = 'iframe[data-jam-capture], iframe[data-jam-recorder], iframe[src*="jam.dev"]';

interface JamLoaderOptions {
  documentRef?: Document;
  mediaRecorderAvailable?: boolean;
}

function appendJamModule(documentRef: Document, source: string): Promise<void> {
  const existing = Array.from(
    documentRef.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'),
  ).find((script) => script.src === source);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.type = 'module';
    script.async = true;
    script.src = source;
    script.dataset.jamRecorder = 'true';

    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      outcome();
    };
    const timeoutId = setTimeout(() => {
      script.remove();
      finish(() => reject(new Error(`Jam module load timed out: ${source}`)));
    }, JAM_SCRIPT_TIMEOUT_MS);

    script.addEventListener('load', () => finish(resolve), { once: true });
    script.addEventListener('error', () => finish(resolve), { once: true });
    documentRef.head.append(script);
  });
}

export async function loadJamRecorder(options: JamLoaderOptions = {}): Promise<void> {
  const documentRef = options.documentRef ?? document;
  const mediaRecorderAvailable = options.mediaRecorderAvailable
    ?? typeof globalThis.MediaRecorder !== 'undefined';
  if (!mediaRecorderAvailable) return;

  await Promise.all(JAM_SCRIPT_URLS.map((source) => appendJamModule(documentRef, source)));
}

function detachJamFrames(documentRef: Document): void {
  for (const frame of documentRef.querySelectorAll<HTMLIFrameElement>(JAM_FRAME_SELECTOR)) frame.remove();
}

export function scheduleJamRecorder(options: JamLoaderOptions = {}): void {
  const documentRef = options.documentRef ?? document;
  const windowRef = documentRef.defaultView ?? window;
  let started = false;

  // pagehide, not unload: unload listeners make the page ineligible for bfcache.
  // Nothing is restored on pageshow; see the note on JAM_PASSIVE_DELAY_MS.
  windowRef.addEventListener('pagehide', () => {
    detachJamFrames(documentRef);
  }, { capture: true });

  const start = (): void => {
    if (started) return;
    started = true;
    windowRef.removeEventListener('pointerdown', onInteract, true);
    windowRef.removeEventListener('keydown', onInteract, true);
    const load = (): void => {
      void loadJamRecorder(options).catch((): undefined => undefined);
    };
    if (typeof windowRef.requestIdleCallback === 'function') {
      windowRef.requestIdleCallback(load, { timeout: 2_000 });
    } else {
      windowRef.setTimeout(load, 0);
    }
  };

  const onInteract = (): void => {
    start();
  };

  const arm = (): void => {
    windowRef.addEventListener('pointerdown', onInteract, { capture: true, passive: true });
    windowRef.addEventListener('keydown', onInteract, true);
    windowRef.setTimeout(start, JAM_PASSIVE_DELAY_MS);
  };

  if (documentRef.readyState === 'complete') arm();
  else windowRef.addEventListener('load', arm, { once: true });
}
