import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect } from 'react';

import type { TimerSignal } from './timer';

const KEEP_AWAKE_TAG = 'debate-timer';

/**
 * The Timer's signals: the website's beeps from bundled sounds
 * (assets/sounds, see its README) and a haptic tap with each. Muting the
 * sound keeps the tap, so a muted timer still says when time is up.
 */
export function useTimerSignals(): (signal: TimerSignal, sound: boolean) => void {
  const beep = useAudioPlayer(require('@/assets/sounds/beep.wav'));
  const doubleBeep = useAudioPlayer(require('@/assets/sounds/double-beep.wav'));

  useEffect(() => {
    // A timer is heard in a round even with the ringer off.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch((cause: unknown) =>
      console.warn('Could not set the audio mode:', cause instanceof Error ? cause.message : cause));
  }, []);

  return useCallback((signal: TimerSignal, sound: boolean) => {
    const haptic = signal === 'beep'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    haptic.catch(() => {});
    if (!sound) return;
    const player = signal === 'beep' ? beep : doubleBeep;
    try {
      player.seekTo(0).catch(() => {});
      player.play();
    } catch (cause) {
      console.warn('Could not play the timer signal:', cause instanceof Error ? cause.message : cause);
    }
  }, [beep, doubleBeep]);
}

/** Keeps the screen on while a timer runs, and lets it sleep again when it stops or the screen closes. */
export function useKeepAwakeWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [active]);
}
