import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpeechCapture } from './speech-capture';
import type { Recognizer } from './speech-recognition';

type Handler = (event: unknown) => void;

function fakeRecognizer(granted = true) {
  const handlers = new Map<string, Set<Handler>>();
  const fake = {
    starts: 0,
    stopBehaviour: 'end' as 'end' | 'silent',
    emit: (event: string, payload: unknown = null) => handlers.get(event)?.forEach((handler) => handler(payload)),
    heard: (text: string, isFinal = true) => fake.emit('result', { isFinal, results: [{ transcript: text, confidence: 1, segments: [] }] }),
    recognizer: {
      start: () => {
        fake.starts += 1;
      },
      stop: () => {
        if (fake.stopBehaviour === 'end') queueMicrotask(() => fake.emit('end'));
      },
      abort: () => {},
      requestPermissionsAsync: async () => ({ granted, canAskAgain: true }),
      getPermissionsAsync: async () => ({ granted, canAskAgain: true, status: granted ? 'granted' : 'denied' }),
      addListener: (event: string, handler: Handler) => {
        const set = handlers.get(event) ?? new Set();
        set.add(handler);
        handlers.set(event, set);
        return { remove: () => set.delete(handler) };
      },
    } as unknown as Recognizer,
  };
  return fake;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('speech capture', () => {
  it('keeps listening when iOS ends a session, and times the whole take with its long pauses', async () => {
    const fake = fakeRecognizer();
    const finals: string[] = [];
    const capture = new SpeechCapture(fake.recognizer, { lang: 'en-US', onFinalText: (text) => finals.push(text) });
    expect(await capture.start()).toBe(true);
    vi.advanceTimersByTime(2_000);
    fake.heard('um the first');
    vi.advanceTimersByTime(4_000);
    fake.heard('point is', false);
    // iOS closes the request on its own; the interim words count and listening carries on.
    fake.emit('end');
    expect(fake.starts).toBe(2);
    expect(capture.getState().listening).toBe(true);
    vi.advanceTimersByTime(1_000);
    fake.heard('basically clear');
    vi.advanceTimersByTime(1_000);
    await capture.stop();
    expect(finals).toEqual(['um the first', 'point is', 'basically clear']);
    expect(capture.getTake()).toEqual({ text: 'um the first point is basically clear', speakingMs: 8_000, pausesMs: [4_000] });
    expect(capture.getState().listening).toBe(false);
  });

  it('gives up after three sessions that die at once', async () => {
    const fake = fakeRecognizer();
    const capture = new SpeechCapture(fake.recognizer, { lang: 'en-US', onFinalText: () => {} });
    await capture.start();
    fake.emit('end');
    fake.emit('end');
    fake.emit('end');
    expect(capture.getState()).toMatchObject({ listening: false, error: 'start-failed' });
  });

  it('stops after a grace period when the last words never come', async () => {
    const fake = fakeRecognizer();
    fake.stopBehaviour = 'silent';
    const capture = new SpeechCapture(fake.recognizer, { lang: 'en-US', onFinalText: () => {} });
    await capture.start();
    const stopped = capture.stop();
    // A second caller joins the stop in progress.
    expect(capture.stop()).toBe(stopped);
    vi.advanceTimersByTime(1_500);
    await stopped;
    expect(capture.getState().listening).toBe(false);
  });

  it('reports a refused microphone and does not listen', async () => {
    const fake = fakeRecognizer(false);
    const onDenied = vi.fn();
    const capture = new SpeechCapture(fake.recognizer, { lang: 'hu-HU', onFinalText: () => {}, onDenied });
    expect(await capture.start()).toBe(false);
    expect(fake.starts).toBe(0);
    expect(onDenied).toHaveBeenCalledOnce();
    expect(capture.getState().error).toBe('not-allowed');
  });

  it('drops a start that was still waiting for permission when the turn ends', async () => {
    const fake = fakeRecognizer();
    const capture = new SpeechCapture(fake.recognizer, { lang: 'en-US', onFinalText: () => {} });
    const starting = capture.start();
    capture.cancel();
    expect(await starting).toBe(false);
    expect(fake.starts).toBe(0);
  });
});
