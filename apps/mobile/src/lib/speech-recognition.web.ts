import type { Recognizer } from './speech-recognition';

export type { Recognizer };

type Listener = (event: unknown) => void;

/**
 * The web preview has no iOS speech recognizer. When the screenshot script
 * sets `window.__debatelabFakeSpeech` (phrases, each heard after its delay in
 * ms on the page's clock), this fake recognizer "hears" them, so the voice
 * round's screens can be shot; otherwise voice shows as unavailable, as in
 * Expo Go. The phone app uses speech-recognition.ts.
 */
type FakeSpeech = { phrases: { text: string; afterMs: number }[] };

function fakeRecognizer(script: FakeSpeech): Recognizer {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((listener) => listener(payload));
  let timers: ReturnType<typeof setTimeout>[] = [];
  let next = 0;
  const end = () => {
    timers.forEach(clearTimeout);
    timers = [];
    setTimeout(() => emit('end', null), 0);
  };
  return {
    start() {
      let at = 0;
      for (const phrase of script.phrases.slice(next)) {
        at += phrase.afterMs;
        timers.push(setTimeout(() => {
          next += 1;
          emit('result', { isFinal: false, results: [{ transcript: phrase.text.split(' ').slice(0, 2).join(' '), confidence: 0, segments: [] }] });
          emit('result', { isFinal: true, results: [{ transcript: phrase.text, confidence: 1, segments: [] }] });
        }, at));
      }
    },
    stop: end,
    abort: end,
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    getPermissionsAsync: async () => ({ granted: true, canAskAgain: true, status: 'granted' }),
    addListener(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as Listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener as Listener) };
    },
  };
}

let recognizer: Recognizer | null = null;

export function speechRecognizer(): Recognizer | null {
  const script = (window as unknown as { __debatelabFakeSpeech?: FakeSpeech }).__debatelabFakeSpeech;
  if (!script) return null;
  recognizer ??= fakeRecognizer(script);
  return recognizer;
}
