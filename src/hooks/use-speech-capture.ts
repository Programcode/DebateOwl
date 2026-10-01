import { useCallback, useEffect, useRef, useState } from 'react';
import { toIntlLocale, type AppLanguage } from '@/lib/languages';
import { LONG_PAUSE_SECONDS, type SpeechTake } from '@/lib/voice/delivery';
import { useVoiceAvailabilityStore } from '@/lib/voice/availability';

// Speech capture for a spoken turn. It is a sibling of useSpeechToText, which
// serves short dictation: a turn can run for minutes, so this hook restarts
// recognition when the browser ends it on silence, shows interim words, and
// times the take. Audio goes from the microphone to the browser's recogniser
// only. DebateLab never receives or stores it.

type Recognition = InstanceType<typeof window.SpeechRecognition>;

export type SpeechCaptureError = 'not-allowed' | 'no-microphone' | 'network' | 'start-failed';

const STOP_GRACE_MS = 1_500;
/** A recogniser that keeps dying this quickly is not going to recover. */
const MIN_HEALTHY_SESSION_MS = 750;
const MAX_QUICK_FAILURES = 3;

function emptyTake(): SpeechTake {
  return { text: '', speakingMs: 0, pausesMs: [] };
}

export interface SpeechCapture {
  listening: boolean;
  /** Words heard but not yet final. */
  interim: string;
  error: SpeechCaptureError | null;
  start: () => Promise<boolean>;
  /** Stops listening and resolves once the last words have arrived. */
  stop: () => Promise<void>;
  /** Everything captured since the last reset, across pauses and restarts. */
  getTake: () => SpeechTake;
  resetTake: () => void;
}

export function useSpeechCapture(language: AppLanguage, onFinalText: (text: string) => void): SpeechCapture {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechCaptureError | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const wantListeningRef = useRef(false);
  const takeRef = useRef<SpeechTake>(emptyTake());
  const startedAtRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const lastResultAtRef = useRef<number | null>(null);
  const interimRef = useRef('');
  const quickFailuresRef = useRef(0);
  const stoppedRef = useRef<(() => void) | null>(null);
  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;

  const commitFinal = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    takeRef.current.text = takeRef.current.text ? `${takeRef.current.text} ${clean}` : clean;
    onFinalTextRef.current(clean);
  }, []);

  const finishListening = useCallback(() => {
    if (startedAtRef.current) takeRef.current.speakingMs += Date.now() - startedAtRef.current;
    startedAtRef.current = 0;
    // Words still marked interim when the recogniser closes were spoken.
    commitFinal(interimRef.current);
    interimRef.current = '';
    setInterim('');
    wantListeningRef.current = false;
    recognitionRef.current = null;
    setListening(false);
    stoppedRef.current?.();
    stoppedRef.current = null;
  }, [commitFinal]);

  const fail = useCallback((reason: SpeechCaptureError) => {
    setError(reason);
    if (reason === 'not-allowed') useVoiceAvailabilityStore.getState().markMicrophoneDenied();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = () => {};
      try { recognition.abort(); } catch { /* already closed */ }
    }
    finishListening();
  }, [finishListening]);

  const start = useCallback(async () => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor || wantListeningRef.current) return false;
    setError(null);
    wantListeningRef.current = true;
    try {
      // Ask for the microphone up front so a refusal is reported clearly.
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      wantListeningRef.current = false;
      const reason: SpeechCaptureError = name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'not-allowed'
        : name === 'NotFoundError' ? 'no-microphone' : 'start-failed';
      setError(reason);
      if (reason === 'not-allowed') useVoiceAvailabilityStore.getState().markMicrophoneDenied();
      return false;
    }
    if (!wantListeningRef.current) return false;

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = toIntlLocale(language);

    recognition.onresult = (event) => {
      const now = Date.now();
      const last = lastResultAtRef.current;
      if (last !== null && now - last >= LONG_PAUSE_SECONDS * 1_000) takeRef.current.pausesMs.push(now - last);
      lastResultAtRef.current = now;
      let pending = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) commitFinal(result[0].transcript);
        else pending += result[0].transcript;
      }
      interimRef.current = pending;
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') fail('not-allowed');
      else if (event.error === 'audio-capture') fail('no-microphone');
      else if (event.error === 'network') fail('network');
      // 'no-speech' and 'aborted' end the session; onend decides what follows.
    };

    recognition.onend = () => {
      if (!wantListeningRef.current || recognitionRef.current !== recognition) {
        finishListening();
        return;
      }
      // The browser closed the session (silence, or its own time limit) while
      // the student is still on the clock. Carry on listening.
      commitFinal(interimRef.current);
      interimRef.current = '';
      setInterim('');
      quickFailuresRef.current = Date.now() - sessionStartedAtRef.current < MIN_HEALTHY_SESSION_MS
        ? quickFailuresRef.current + 1
        : 0;
      if (quickFailuresRef.current >= MAX_QUICK_FAILURES) {
        fail('start-failed');
        return;
      }
      try {
        sessionStartedAtRef.current = Date.now();
        recognition.start();
      } catch {
        fail('start-failed');
      }
    };

    recognitionRef.current = recognition;
    quickFailuresRef.current = 0;
    lastResultAtRef.current = null;
    try {
      startedAtRef.current = Date.now();
      sessionStartedAtRef.current = startedAtRef.current;
      recognition.start();
    } catch {
      fail('start-failed');
      return false;
    }
    setListening(true);
    return true;
  }, [commitFinal, fail, finishListening, language]);

  const stop = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      wantListeningRef.current = false;
      return;
    }
    wantListeningRef.current = false;
    // The recogniser delivers its last words after stop(), then ends.
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        recognition.onend = () => {};
        try { recognition.abort(); } catch { /* already closed */ }
        finishListening();
      }, STOP_GRACE_MS);
      stoppedRef.current = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      try {
        recognition.stop();
      } catch {
        finishListening();
      }
    });
  }, [finishListening]);

  const getTake = useCallback((): SpeechTake => ({
    ...takeRef.current,
    pausesMs: [...takeRef.current.pausesMs],
    speakingMs: takeRef.current.speakingMs + (startedAtRef.current ? Date.now() - startedAtRef.current : 0),
  }), []);

  const resetTake = useCallback(() => {
    takeRef.current = emptyTake();
    lastResultAtRef.current = null;
  }, []);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    wantListeningRef.current = false;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = () => {};
    recognition.onerror = () => {};
    recognition.onend = () => {};
    try { recognition.abort(); } catch { /* already closed */ }
  }, []);

  return { listening, interim, error, start, stop, getTake, resetTake };
}
