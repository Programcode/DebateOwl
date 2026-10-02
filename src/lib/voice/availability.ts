import { useEffect } from 'react';
import { create } from 'zustand';

// Whether voice rounds can run in this browser. Voice needs the Web Speech
// recogniser and a microphone the student has not blocked. When either is
// missing, voice mode is hidden with a short reason and typing carries on.

export type VoiceUnavailableReason = 'unsupported' | 'denied';

const NOTICE_STORAGE_KEY = 'debatelab-voice-notice-v1';

function recognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function noticeAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_STORAGE_KEY) === 'acknowledged';
  } catch {
    return false;
  }
}

interface VoiceAvailabilityState {
  microphoneDenied: boolean;
  /** The student has read the first-use privacy notice in this browser. */
  noticeAcknowledged: boolean;
  markMicrophoneDenied: () => void;
  setMicrophoneDenied: (denied: boolean) => void;
  acknowledgeNotice: () => void;
}

export const useVoiceAvailabilityStore = create<VoiceAvailabilityState>((set) => ({
  microphoneDenied: false,
  noticeAcknowledged: typeof window !== 'undefined' && noticeAcknowledged(),
  markMicrophoneDenied: () => set({ microphoneDenied: true }),
  setMicrophoneDenied: (microphoneDenied) => set({ microphoneDenied }),
  acknowledgeNotice: () => {
    try { window.localStorage.setItem(NOTICE_STORAGE_KEY, 'acknowledged'); } catch { /* storage unavailable */ }
    set({ noticeAcknowledged: true });
  },
}));

export interface VoiceAvailability {
  available: boolean;
  reason: VoiceUnavailableReason | null;
}

export function useVoiceAvailability(): VoiceAvailability {
  const microphoneDenied = useVoiceAvailabilityStore((state) => state.microphoneDenied);
  const setMicrophoneDenied = useVoiceAvailabilityStore((state) => state.setMicrophoneDenied);
  const supported = recognitionSupported();

  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return;
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const sync = () => {
      if (status) setMicrophoneDenied(status.state === 'denied');
    };
    // Some browsers do not know the "microphone" permission name and reject.
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
      if (cancelled) return;
      status = result;
      sync();
      result.addEventListener('change', sync);
    }).catch((): void => {});
    return () => {
      cancelled = true;
      status?.removeEventListener('change', sync);
    };
  }, [setMicrophoneDenied, supported]);

  if (!supported) return { available: false, reason: 'unsupported' };
  if (microphoneDenied) return { available: false, reason: 'denied' };
  return { available: true, reason: null };
}
