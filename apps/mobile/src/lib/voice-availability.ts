import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { speechRecognizer } from './speech-recognition';

// Whether voice can be used here, as the website's src/lib/voice/availability.ts:
// speech recognition must be in the build (never in Expo Go), and the
// microphone and speech recognition must not be refused in Settings. The
// first-use privacy notice is remembered on the device, as the website
// remembers it in the browser.

export type VoiceUnavailableReason = 'unsupported' | 'denied';

const NOTICE_KEY = 'debatelab.voice-notice-v1';

let state = { denied: false, noticeAcknowledged: false };
let noticeRead: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

function readNotice() {
  noticeRead ??= AsyncStorage.getItem(NOTICE_KEY)
    .then((value) => {
      if (value === 'acknowledged') set({ noticeAcknowledged: true });
    })
    .catch(() => {});
  return noticeRead;
}

/** The student refused the microphone or speech recognition. */
export function markVoiceDenied() {
  set({ denied: true });
}

export function acknowledgeVoiceNotice() {
  set({ noticeAcknowledged: true });
  AsyncStorage.setItem(NOTICE_KEY, 'acknowledged').catch(() => {});
}

/** Reads Settings again: a student may have allowed the microphone since. */
async function checkPermission() {
  const recognizer = speechRecognizer();
  if (!recognizer) return;
  try {
    const permission = await recognizer.getPermissionsAsync();
    // A refusal iOS will not ask about again; one it still asks about is not a refusal yet.
    set({ denied: !permission.granted && !permission.canAskAgain });
  } catch {
    // Unknown: leave it as it was.
  }
}

export interface VoiceAvailability {
  available: boolean;
  reason: VoiceUnavailableReason | null;
  noticeAcknowledged: boolean;
}

export function useVoiceAvailability(): VoiceAvailability {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const supported = speechRecognizer() !== null;

  useEffect(() => {
    if (!supported) return;
    void readNotice();
    void checkPermission();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkPermission();
    });
    return () => subscription.remove();
  }, [supported]);

  if (!supported) return { available: false, reason: 'unsupported', noticeAcknowledged: current.noticeAcknowledged };
  if (current.denied) return { available: false, reason: 'denied', noticeAcknowledged: current.noticeAcknowledged };
  return { available: true, reason: null, noticeAcknowledged: current.noticeAcknowledged };
}
