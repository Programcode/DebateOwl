import type { ExpoSpeechRecognitionNativeEventMap, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { nativeCapabilities } from './native-capabilities';

/**
 * The few calls the app makes on iOS's speech recognizer, so speech-capture.ts
 * can run on a fake in tests and in the web preview.
 */
export interface Recognizer {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean; status: string }>;
  addListener<E extends 'result' | 'error' | 'end'>(event: E, listener: (event: ExpoSpeechRecognitionNativeEventMap[E]) => void): { remove(): void };
}

let recognizer: Recognizer | null | undefined;

/**
 * expo-speech-recognition, in a build that has it (the development build);
 * null in Expo Go, which is never asked for the module.
 */
export function speechRecognizer(): Recognizer | null {
  if (recognizer !== undefined) return recognizer;
  recognizer = null;
  if (!nativeCapabilities().speechRecognition) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition') as typeof import('expo-speech-recognition');
    recognizer = ExpoSpeechRecognitionModule as unknown as Recognizer;
  } catch (cause) {
    console.warn('Speech recognition is unavailable:', cause instanceof Error ? cause.message : cause);
  }
  return recognizer;
}
