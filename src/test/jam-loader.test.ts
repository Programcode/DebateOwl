import { describe, expect, it } from 'vitest';
import { loadJamRecorder } from '@/jam-loader';

function jamScripts() {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'));
}

describe('Jam recorder loader', () => {
  it('does not load recorder scripts when MediaRecorder is unavailable', async () => {
    jamScripts().forEach((element) => element.remove());

    await loadJamRecorder({ documentRef: document, mediaRecorderAvailable: false });

    expect(jamScripts()).toHaveLength(0);
  });

  it('loads recorder then capture before resolving startup', async () => {
    jamScripts().forEach((element) => element.remove());

    const loading = loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    expect(jamScripts().map((script) => script.src)).toEqual(['https://js.jam.dev/recorder.js']);

    jamScripts()[0].dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(jamScripts().map((script) => script.src)).toEqual([
      'https://js.jam.dev/recorder.js',
      'https://js.jam.dev/capture.js',
    ]);
    expect(jamScripts().every((script) => script.type === 'module' && !script.async)).toBe(true);

    jamScripts()[1].dispatchEvent(new Event('load'));
    await loading;
    await loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    expect(jamScripts()).toHaveLength(2);
  });
});
