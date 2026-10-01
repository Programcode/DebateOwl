import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechCapture } from '@/hooks/use-speech-capture';
import { useVoiceAvailability, useVoiceAvailabilityStore } from '@/lib/voice/availability';

type Result = { isFinal: boolean; 0: { transcript: string; confidence: number } };

class MockRecognition {
  static instances: MockRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: (event: { resultIndex: number; results: Result[] }) => void = () => {};
  onerror: (event: { error: string }) => void = () => {};
  onend: () => void = () => {};
  start = vi.fn();
  /** Like Chrome: the last words arrive after stop(), then the session ends. */
  stop = vi.fn(() => {
    if (this.pendingOnStop) this.emit([{ text: this.pendingOnStop, final: true }]);
    this.onend();
  });
  abort = vi.fn();
  pendingOnStop = '';
  constructor() { MockRecognition.instances.push(this); }
  emit(results: Array<{ text: string; final: boolean }>) {
    this.onresult({
      resultIndex: 0,
      results: results.map(({ text, final }) => ({ isFinal: final, 0: { transcript: text, confidence: 1 } })),
    });
  }
}

function latest(): MockRecognition {
  return MockRecognition.instances[MockRecognition.instances.length - 1];
}

function setRecognition(value: unknown) {
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });
}

function setMediaDevices(getUserMedia: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: getUserMedia ? { getUserMedia } : undefined });
}

describe('useSpeechCapture', () => {
  const finals: string[] = [];
  const onFinal = (text: string) => { finals.push(text); };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    MockRecognition.instances = [];
    finals.length = 0;
    setRecognition(MockRecognition);
    setMediaDevices(vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })));
    useVoiceAvailabilityStore.setState({ microphoneDenied: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listens continuously in the language of the round and shows interim words', async () => {
    const { result } = renderHook(() => useSpeechCapture('hu', onFinal));
    await act(async () => { expect(await result.current.start()).toBe(true); });
    expect(latest().lang).toBe('hu-HU');
    expect(latest().continuous).toBe(true);
    expect(latest().interimResults).toBe(true);
    expect(result.current.listening).toBe(true);

    act(() => latest().emit([{ text: 'a szabad', final: false }]));
    expect(result.current.interim).toBe('a szabad');
    expect(finals).toEqual([]);

    act(() => latest().emit([{ text: 'A szabad közlekedés', final: true }, { text: 'mindenkit', final: false }]));
    expect(finals).toEqual(['A szabad közlekedés']);
    expect(result.current.interim).toBe('mindenkit');
  });

  it('keeps listening when the browser ends the session on its own', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    const recognition = latest();
    act(() => recognition.emit([{ text: 'first part', final: false }]));

    vi.advanceTimersByTime(8_000);
    act(() => recognition.onend());
    // The words still pending are kept, and recognition starts again.
    expect(finals).toEqual(['first part']);
    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(result.current.listening).toBe(true);
  });

  it('gives up when recognition dies immediately, again and again', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    const recognition = latest();
    act(() => { recognition.onend(); recognition.onend(); recognition.onend(); });
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBe('start-failed');
  });

  it('waits for the last words before stop resolves, and measures the take', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    const recognition = latest();

    vi.advanceTimersByTime(2_000);
    act(() => recognition.emit([{ text: 'Free fares remove the barrier', final: true }]));
    vi.advanceTimersByTime(4_500);
    act(() => recognition.emit([{ text: 'for every rider', final: false }]));
    vi.advanceTimersByTime(1_000);
    act(() => recognition.emit([{ text: 'for every rider', final: false }]));
    vi.advanceTimersByTime(2_500);

    recognition.pendingOnStop = 'for every rider';
    await act(async () => { await result.current.stop(); });
    expect(result.current.listening).toBe(false);
    expect(finals).toEqual(['Free fares remove the barrier', 'for every rider']);
    expect(result.current.getTake()).toEqual({
      text: 'Free fares remove the barrier for every rider',
      speakingMs: 10_000,
      // The 4.5 s silence counts; the 1 s and 2.5 s gaps do not.
      pausesMs: [4_500],
    });

    act(() => result.current.resetTake());
    expect(result.current.getTake()).toEqual({ text: '', speakingMs: 0, pausesMs: [] });
  });

  it('adds up several takes within one turn', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    vi.advanceTimersByTime(3_000);
    latest().pendingOnStop = 'one';
    await act(async () => { await result.current.stop(); });

    vi.advanceTimersByTime(60_000);
    await act(async () => { await result.current.start(); });
    vi.advanceTimersByTime(2_000);
    latest().pendingOnStop = 'two';
    await act(async () => { await result.current.stop(); });

    // The minute with the microphone off is neither speaking time nor a pause.
    expect(result.current.getTake()).toEqual({ text: 'one two', speakingMs: 5_000, pausesMs: [] });
  });

  it('does not hang when the browser never confirms the stop', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    const recognition = latest();
    act(() => recognition.emit([{ text: 'trailing words', final: false }]));
    recognition.stop = vi.fn();

    let stopped = false;
    await act(async () => {
      const stopping = result.current.stop().then(() => { stopped = true; });
      await vi.advanceTimersByTimeAsync(1_500);
      await stopping;
    });
    expect(stopped).toBe(true);
    expect(recognition.abort).toHaveBeenCalled();
    expect(finals).toEqual(['trailing words']);
    expect(result.current.listening).toBe(false);
  });

  it('reports a refused microphone and marks voice unavailable', async () => {
    setMediaDevices(vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }));
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { expect(await result.current.start()).toBe(false); });
    expect(result.current.error).toBe('not-allowed');
    expect(result.current.listening).toBe(false);
    expect(MockRecognition.instances).toHaveLength(0);

    const availability = renderHook(() => useVoiceAvailability());
    expect(availability.result.current).toEqual({ available: false, reason: 'denied' });
  });

  it('reports a recogniser that loses permission, its microphone, or its connection', async () => {
    for (const [code, expected] of [['not-allowed', 'not-allowed'], ['service-not-allowed', 'not-allowed'], ['audio-capture', 'no-microphone'], ['network', 'network']] as const) {
      const { result, unmount } = renderHook(() => useSpeechCapture('en', onFinal));
      await act(async () => { await result.current.start(); });
      act(() => latest().onerror({ error: code }));
      expect(result.current.error).toBe(expected);
      expect(result.current.listening).toBe(false);
      unmount();
    }
    expect(useVoiceAvailabilityStore.getState().microphoneDenied).toBe(true);
  });

  it('treats silence as a pause in the take, not as an error', async () => {
    const { result } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    act(() => latest().onerror({ error: 'no-speech' }));
    expect(result.current.error).toBeNull();
    expect(result.current.listening).toBe(true);
  });

  it('reports a missing microphone, and stops the recogniser on unmount', async () => {
    setMediaDevices(vi.fn(async () => { throw new DOMException('none', 'NotFoundError'); }));
    const missing = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await missing.result.current.start(); });
    expect(missing.result.current.error).toBe('no-microphone');

    setMediaDevices(undefined);
    const { result, unmount } = renderHook(() => useSpeechCapture('en', onFinal));
    await act(async () => { await result.current.start(); });
    const recognition = latest();
    unmount();
    expect(recognition.abort).toHaveBeenCalled();
  });

  it('says voice is unsupported where the browser has no speech recognition', () => {
    setRecognition(undefined);
    const { result } = renderHook(() => useVoiceAvailability());
    expect(result.current).toEqual({ available: false, reason: 'unsupported' });
  });

  it('follows the browser permission when it is denied or restored', async () => {
    vi.useRealTimers();
    const listeners: Array<() => void> = [];
    const status = { state: 'denied', addEventListener: (_: string, listener: () => void) => { listeners.push(listener); }, removeEventListener: vi.fn() };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: vi.fn(async () => status) } });
    try {
      const { result } = renderHook(() => useVoiceAvailability());
      await vi.waitFor(() => expect(result.current).toEqual({ available: false, reason: 'denied' }));
      status.state = 'granted';
      act(() => listeners.forEach((listener) => listener()));
      expect(result.current).toEqual({ available: true, reason: null });
    } finally {
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
    }
  });
});
