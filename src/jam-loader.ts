const JAM_SCRIPT_URLS = [
  'https://js.jam.dev/recorder.js',
  'https://js.jam.dev/capture.js',
] as const;

interface JamLoaderOptions {
  documentRef?: Document;
  mediaRecorderAvailable?: boolean;
}

function appendJamModule(documentRef: Document, source: string): Promise<void> {
  const existing = Array.from(
    documentRef.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'),
  ).find((script) => script.src === source);
  if (existing) return Promise.resolve();

  return new Promise((resolve) => {
    const script = documentRef.createElement('script');
    script.type = 'module';
    script.async = false;
    script.src = source;
    script.dataset.jamRecorder = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => resolve(), { once: true });
    documentRef.head.append(script);
  });
}

export async function loadJamRecorder(options: JamLoaderOptions = {}): Promise<void> {
  const documentRef = options.documentRef ?? document;
  const mediaRecorderAvailable = options.mediaRecorderAvailable
    ?? typeof globalThis.MediaRecorder !== 'undefined';
  if (!mediaRecorderAvailable) return;

  for (const source of JAM_SCRIPT_URLS) {
    await appendJamModule(documentRef, source);
  }
}
