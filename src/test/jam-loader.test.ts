import { describe, expect, it } from 'vitest';
import { loadJamRecorder } from '@/jam-loader';

describe('Jam recorder loader', () => {
  it('does not load recorder scripts when MediaRecorder is unavailable', () => {
    document.head.querySelectorAll('[data-jam-recorder]').forEach((element) => element.remove());

    loadJamRecorder({ documentRef: document, mediaRecorderAvailable: false });

    expect(document.head.querySelectorAll('[data-jam-recorder]')).toHaveLength(0);
  });

  it('loads each Jam module once when recording is supported', () => {
    document.head.querySelectorAll('[data-jam-recorder]').forEach((element) => element.remove());

    loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });
    loadJamRecorder({ documentRef: document, mediaRecorderAvailable: true });

    const scripts = Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[data-jam-recorder]'));
    expect(scripts.map((script) => script.src)).toEqual([
      'https://js.jam.dev/recorder.js',
      'https://js.jam.dev/capture.js',
    ]);
    expect(scripts.every((script) => script.type === 'module')).toBe(true);
  });
});
