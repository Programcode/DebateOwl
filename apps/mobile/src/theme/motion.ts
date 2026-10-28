import { Easing } from 'react-native-reanimated';

/**
 * The website's motion tokens (src/styles/tokens.css, `--do-dur-*` and `--do-ease-*`) for
 * Reanimated. Everything runs on the UI thread; under Reduce Motion each component settles
 * at once (Reanimated's useReducedMotion, and layout animations follow the system setting).
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
