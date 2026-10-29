/**
 * Speech clock arithmetic in milliseconds. Pausing keeps the exact remainder, so a
 * pause never hands the speaker the rest of the current second.
 */
export interface ClockState {
  /** Milliseconds left while paused; ignored while running. */
  remainingMs: number;
  /** When the speech ends, while running. */
  deadline: number | null;
}

export function startClock(state: ClockState, now: number): ClockState {
  if (state.deadline !== null || state.remainingMs <= 0) return state;
  return { remainingMs: state.remainingMs, deadline: now + state.remainingMs };
}

export function pauseClock(state: ClockState, now: number): ClockState {
  if (state.deadline === null) return state;
  return { remainingMs: Math.max(0, state.deadline - now), deadline: null };
}

export function remainingMs(state: ClockState, now: number): number {
  return state.deadline === null ? state.remainingMs : Math.max(0, state.deadline - now);
}

/** Whole seconds shown on the clock face: 0.2s left still reads 0:01. */
export function displaySeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
