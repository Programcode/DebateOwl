import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadJamRecorder } from '@/jam-loader';

function jamScripts() {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'));
}

describe('Jam recorder loader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not load recorder scripts when MediaRecorder is unavailable', async () => {
    jamScripts().forEach((element) => element.remove());

    await loadJamRecorder({ documentRef: document, mediaRecorderAvailable: false });

    expect(jamScripts()).toHaveLength(0);
  });

  it('loads recorder and capture in parallel without parser-blocking scripts', async () => {
    jamScripts().forEach((element) => element.remove());

    const loading = loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    expect(jamScripts().map((script) => script.src)).toEqual([
      'https://js.jam.dev/recorder.js',
      'https://js.jam.dev/capture.js',
    ]);
    expect(jamScripts().every((script) => script.type === 'module' && script.async)).toBe(true);

    jamScripts()[0].dispatchEvent(new Event('load'));
    jamScripts()[1].dispatchEvent(new Event('load'));
    await loading;
    await loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    expect(jamScripts()).toHaveLength(2);
  });

  it('rejects a stalled Jam load so application bootstrap can continue', async () => {
    jamScripts().forEach((element) => element.remove());
    vi.useFakeTimers();

    const loading = loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    const rejection = expect(loading).rejects.toThrow('Jam module load timed out');
    await vi.advanceTimersByTimeAsync(3_000);

    await rejection;
    expect(jamScripts()).toHaveLength(0);
  });
});
