import { toIntlLocale, type AppLanguage } from '@debatelab/core/languages';
import type { SpeechTake } from '@debatelab/core/voice/delivery';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { SpeechCapture, type CaptureState } from './speech-capture';
import { speechRecognizer } from './speech-recognition';
import { markVoiceDenied } from './voice-availability';

export interface SpeechCaptureApi extends CaptureState {
  /** False in Expo Go and wherever speech recognition is missing. */
  available: boolean;
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  cancel: () => void;
  getTake: () => SpeechTake;
  resetTake: () => void;
}

const IDLE: CaptureState = { listening: false, interim: '', error: null };
const noop = () => () => {};
const idle = () => IDLE;

/**
 * Speech capture for a screen, in `language`: a spoken turn or a dictated
 * field. Recognised words go to `onFinalText` as they become final. Leaving
 * the screen drops whatever was still being heard.
 */
export function useSpeechCapture(language: AppLanguage, onFinalText: (text: string) => void): SpeechCaptureApi {
  const onFinal = useRef(onFinalText);
  onFinal.current = onFinalText;
  const [capture] = useState(() => {
    const recognizer = speechRecognizer();
    return recognizer
      ? new SpeechCapture(recognizer, { lang: toIntlLocale(language), onFinalText: (text) => onFinal.current(text), onDenied: markVoiceDenied })
      : null;
  });
  // A new language applies from the next start.
  useEffect(() => {
    capture?.setOptions({ lang: toIntlLocale(language), onFinalText: (text) => onFinal.current(text), onDenied: markVoiceDenied });
  }, [capture, language]);
  useEffect(() => () => capture?.cancel(), [capture]);

  const state = useSyncExternalStore(capture?.subscribe ?? noop, capture?.getState ?? idle, capture?.getState ?? idle);
  if (!capture) {
    return {
      ...IDLE,
      available: false,
      start: async () => false,
      stop: async () => {},
      cancel: () => {},
      getTake: () => ({ text: '', speakingMs: 0, pausesMs: [] }),
      resetTake: () => {},
    };
  }
  return { ...state, available: true, start: capture.start, stop: capture.stop, cancel: capture.cancel, getTake: capture.getTake, resetTake: capture.resetTake };
}
