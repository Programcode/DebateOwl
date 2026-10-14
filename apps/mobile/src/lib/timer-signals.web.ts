import type { TimerSignal } from './timer';

/**
 * The web preview has no haptics or wake lock, and a headless browser cannot
 * play the beeps. It records each signal on `window` instead, so the
 * screenshot script can check that the right one fired. The phone app uses
 * timer-signals.ts.
 */
export function useTimerSignals(): (signal: TimerSignal, sound: boolean) => void {
  return (signal, sound) => {
    const target = window as unknown as { __debatelabTimerSignals?: { signal: TimerSignal; sound: boolean }[] };
    (target.__debatelabTimerSignals ??= []).push({ signal, sound });
  };
}

/** Counts the turn-start taps on `window` for the screenshot script. */
export function tapTurnStart() {
  const target = window as unknown as { __debatelabTurnTaps?: number };
  target.__debatelabTurnTaps = (target.__debatelabTurnTaps ?? 0) + 1;
}

export function useKeepAwakeWhile(_active: boolean) {}
