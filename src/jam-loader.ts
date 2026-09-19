const JAM_SCRIPT_URLS = [
  'https://js.jam.dev/recorder.js',
  'https://js.jam.dev/capture.js',
] as const;
const JAM_SCRIPT_TIMEOUT_MS = 3_000;

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

export function scheduleJamRecorder(options: JamLoaderOptions = {}): void {
  const documentRef = options.documentRef ?? document;
  const windowRef = documentRef.defaultView ?? window;
  const loadWhenIdle = (): void => {
    const load = (): void => {
      void loadJamRecorder(options).catch((): undefined => undefined);
    };
    if (typeof windowRef.requestIdleCallback === 'function') {
      windowRef.requestIdleCallback(load);
    } else {
      windowRef.setTimeout(load, 0);
    }
  };

  if (documentRef.readyState === 'complete') {
    loadWhenIdle();
  } else {
    windowRef.addEventListener('load', loadWhenIdle, { once: true });
  }
}
