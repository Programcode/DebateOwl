/**
 * The debate timer, as the website's TimerPage (src/pages/TimerPage.tsx): the
 * same formats, speeches and signals. The clock keeps timestamps, never counts
 * ticks, so it shows the right time after the app has been in the background.
 */

export interface TimerSpeech {
  id: string;
  labelKey: string;
  minutes: number;
}

export interface TimerFormat {
  id: string;
  nameKey: string;
  speeches: TimerSpeech[];
}

export const TIMER_FORMATS: TimerFormat[] = [
  {
    id: 'standard',
    nameKey: 'timer.formatStandard',
    speeches: [
      { id: 'intro', labelKey: 'timer.speeches.standard.intro', minutes: 4 },
      { id: 'r1', labelKey: 'timer.speeches.standard.r1', minutes: 6 },
      { id: 'r2', labelKey: 'timer.speeches.standard.r2', minutes: 6 },
      { id: 'conc', labelKey: 'timer.speeches.standard.conc', minutes: 3 },
    ],
  },
  {
    id: 'ld',
    nameKey: 'timer.formatLD',
    speeches: [
      { id: 'ac', labelKey: 'timer.speeches.ld.ac', minutes: 6 },
      { id: 'nc', labelKey: 'timer.speeches.ld.nc', minutes: 7 },
      { id: 'ar1', labelKey: 'timer.speeches.ld.ar1', minutes: 4 },
      { id: 'nr', labelKey: 'timer.speeches.ld.nr', minutes: 6 },
      { id: 'ar2', labelKey: 'timer.speeches.ld.ar2', minutes: 3 },
    ],
  },
  {
    id: 'pf',
    nameKey: 'timer.formatPF',
    speeches: [
      { id: 'team1_c', labelKey: 'timer.speeches.pf.team1c', minutes: 4 },
      { id: 'team2_c', labelKey: 'timer.speeches.pf.team2c', minutes: 4 },
      { id: 'team1_r', labelKey: 'timer.speeches.pf.team1r', minutes: 4 },
      { id: 'team2_r', labelKey: 'timer.speeches.pf.team2r', minutes: 4 },
      { id: 'team1_s', labelKey: 'timer.speeches.pf.team1s', minutes: 3 },
      { id: 'team2_s', labelKey: 'timer.speeches.pf.team2s', minutes: 3 },
      { id: 'team1_ff', labelKey: 'timer.speeches.pf.team1ff', minutes: 2 },
      { id: 'team2_ff', labelKey: 'timer.speeches.pf.team2ff', minutes: 2 },
    ],
  },
  {
    id: 'policy',
    nameKey: 'timer.formatPolicy',
    speeches: [
      { id: '1ac', labelKey: 'timer.speeches.policy.1ac', minutes: 8 },
      { id: '1nc', labelKey: 'timer.speeches.policy.1nc', minutes: 8 },
      { id: '2ac', labelKey: 'timer.speeches.policy.2ac', minutes: 8 },
      { id: '2nc', labelKey: 'timer.speeches.policy.2nc', minutes: 8 },
      { id: '1nr', labelKey: 'timer.speeches.policy.1nr', minutes: 5 },
      { id: '1ar', labelKey: 'timer.speeches.policy.1ar', minutes: 5 },
      { id: '2nr', labelKey: 'timer.speeches.policy.2nr', minutes: 5 },
      { id: '2ar', labelKey: 'timer.speeches.policy.2ar', minutes: 5 },
    ],
  },
];

/** One speech's clock: its length, when it last started running, and the time it ran before that. */
export interface TimerClock {
  durationMs: number;
  /** When the clock last started; null while it is stopped. */
  startedAt: number | null;
  /** Time that ran before the last start, across pauses. */
  elapsedBeforeMs: number;
}

export function idleClock(minutes: number): TimerClock {
  return { durationMs: minutes * 60_000, startedAt: null, elapsedBeforeMs: 0 };
}

export function elapsedMs(clock: TimerClock, now: number): number {
  const running = clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt);
  return Math.min(clock.durationMs, clock.elapsedBeforeMs + running);
}

/** Whole seconds left, rounded up as the website shows them: 0:01 until the last moment. */
export function remainingSeconds(clock: TimerClock, now: number): number {
  return Math.max(0, Math.ceil((clock.durationMs - elapsedMs(clock, now)) / 1000));
}

export function startClock(clock: TimerClock, now: number): TimerClock {
  if (clock.startedAt !== null || elapsedMs(clock, now) >= clock.durationMs) return clock;
  return { ...clock, startedAt: now };
}

export function pauseClock(clock: TimerClock, now: number): TimerClock {
  if (clock.startedAt === null) return clock;
  return { ...clock, startedAt: null, elapsedBeforeMs: elapsedMs(clock, now) };
}

export type TimerSignal = 'beep' | 'double-beep';

/**
 * The signal due when the time left moves from `previous` to `current`
 * seconds: one beep on reaching the last minute, two beeps at time up. After
 * a gap in the background that crossed both, only time up sounds.
 */
export function signalBetween(previous: number, current: number): TimerSignal | null {
  if (previous > 0 && current === 0) return 'double-beep';
  if (previous > 60 && current <= 60 && current > 0) return 'beep';
  return null;
}

/**
 * The signal due between two readings of the time left, as the screen redraws.
 * Time left only falls while the clock runs, so every fall is checked, also one
 * that ends in a pause: pausing as 1:01 turns to 1:00 still beeps. A fresh
 * clock (a reset or another speech) moves the reading up and sounds nothing.
 */
export function signalFor(previous: number, current: number, clock: TimerClock): TimerSignal | null {
  if (clock.startedAt === null && clock.elapsedBeforeMs === 0) return null;
  return signalBetween(previous, current);
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
