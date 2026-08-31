const JAM_SCRIPT_URLS = [
  'https://js.jam.dev/recorder.js',
  'https://js.jam.dev/capture.js',
] as const;

interface JamLoaderOptions {
  documentRef?: Document;
  mediaRecorderAvailable?: boolean;
}

export function loadJamRecorder(options: JamLoaderOptions = {}): void {
  const documentRef = options.documentRef ?? document;
  const mediaRecorderAvailable = options.mediaRecorderAvailable
    ?? typeof globalThis.MediaRecorder !== 'undefined';
  if (!mediaRecorderAvailable) return;

  const loadedSources = new Set(
    Array.from(documentRef.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'))
      .map((script) => script.src),
  );

  for (const source of JAM_SCRIPT_URLS) {
    if (loadedSources.has(source)) continue;
    const script = documentRef.createElement('script');
    script.type = 'module';
    script.src = source;
    script.dataset.jamRecorder = 'true';
    documentRef.head.append(script);
  }
}

if (typeof document !== 'undefined') {
  loadJamRecorder();
}
