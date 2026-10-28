import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, useReducedMotion as useStartupReducedMotion } from 'react-native-reanimated';

/**
 * The website's motion tokens (src/styles/tokens.css, `--do-dur-*` and `--do-ease-*`) for
 * Reanimated. Everything runs on the UI thread; under Reduce Motion each component settles
 * at once (useReduceMotion below; layout animations follow the system setting).
 */
export const DURATION = {
  instant: 70,
  quick: 120,
  fast: 180,
  base: 240,
  moderate: 320,
  slow: 450,
  deliberate: 600,
  celebrate: 1400,
  ambient: 2400,
} as const;

export const EASE = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0, 0, 0.2, 1),
  accelerate: Easing.bezier(0.3, 0, 1, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  press: Easing.bezier(0.3, 0, 0.5, 1),
} as const;

/** Springs: `pop` is the website's (framer-motion stiffness 420, damping 22); `press` snaps a button down and back. */
export const SPRING = {
  pop: { stiffness: 420, damping: 22, mass: 1 },
  press: { stiffness: 1100, damping: 38, mass: 0.6 },
  settle: { stiffness: 260, damping: 24, mass: 1 },
} as const;

/** Rows arrive one after another, 40 ms apart, and never more than eight steps late. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), 8) * 40;
}

// The setting as last reported, shared by every component, so one mounted later starts from it.
let latest: boolean | null = null;
const listeners = new Set<(reduce: boolean) => void>();
let watching = false;

function watch() {
  if (watching) return;
  watching = true;
  const report = (reduce: boolean) => {
    if (latest === reduce) return;
    latest = reduce;
    listeners.forEach((listener) => listener(reduce));
  };
  AccessibilityInfo.addEventListener('reduceMotionChanged', report);
  void AccessibilityInfo.isReduceMotionEnabled().then(report, () => undefined);
}

/**
 * Whether Reduce Motion is on, kept current while the app runs. It starts from Reanimated's
 * reading at launch (synchronous, so a first frame never animates by mistake) and follows the
 * setting when the student changes it in Settings, which Reanimated's own hook does not.
 */
export function useReduceMotion(): boolean {
  const startup = useStartupReducedMotion();
  const [reduce, setReduce] = useState(() => latest ?? startup);
  useEffect(() => {
    watch();
    listeners.add(setReduce);
    if (latest !== null) setReduce(latest);
    return () => {
      listeners.delete(setReduce);
    };
  }, []);
  return reduce;
}
