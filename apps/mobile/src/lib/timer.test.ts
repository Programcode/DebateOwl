import { describe, expect, it } from 'vitest';

import { idleClock, pauseClock, remainingSeconds, signalBetween, signalFor, startClock, type TimerClock, type TimerSignal } from './timer';

const T0 = 1_000_000;

describe('timer clock', () => {
  it('shows the right time after a gap with no ticks, as after the app was in the background', () => {
    const clock = startClock(idleClock(4), T0);
    // No tick ran for 90 s; the time comes from the start timestamp alone.
    expect(remainingSeconds(clock, T0 + 90_000)).toBe(150);
  });

  it('keeps the time that ran before a pause and stops at zero', () => {
    let clock = startClock(idleClock(1), T0);
    clock = pauseClock(clock, T0 + 20_500);
    // Paused time does not count.
    expect(remainingSeconds(clock, T0 + 600_000)).toBe(40);
    clock = startClock(clock, T0 + 600_000);
    expect(remainingSeconds(clock, T0 + 610_000)).toBe(30);
    expect(remainingSeconds(clock, T0 + 900_000)).toBe(0);
    // A finished clock does not start again.
    expect(startClock(pauseClock(clock, T0 + 900_000), T0 + 900_000).startedAt).toBeNull();
  });
});

describe('timer signals', () => {
  it('beeps once on reaching the last minute and twice at time up', () => {
    expect(signalBetween(61, 60)).toBe('beep');
    expect(signalBetween(60, 59)).toBeNull();
    expect(signalBetween(1, 0)).toBe('double-beep');
    expect(signalBetween(0, 0)).toBeNull();
  });

  it('sounds only time up when a background gap crossed both thresholds', () => {
    expect(signalBetween(150, 0)).toBe('double-beep');
    expect(signalBetween(150, 30)).toBe('beep');
  });
});

describe('timer signals across a pause', () => {
  /** Reads the clock as the screen does on each redraw, collecting the signals it sounds. */
  function reader(clock: TimerClock, now: number) {
    let last = remainingSeconds(clock, now);
    const heard: TimerSignal[] = [];
    return {
      heard,
      read(next: TimerClock, at: number) {
        const current = remainingSeconds(next, at);
        const due = signalFor(last, current, next);
        last = current;
        if (due) heard.push(due);
      },
    };
  }

  it('beeps once when a pause lands as 1:01 turns to 1:00, and not again on resume', () => {
    let clock = startClock(idleClock(2), T0);
    const screen = reader(clock, T0);
    screen.read(clock, T0 + 59_200); // shows 1:01
    clock = pauseClock(clock, T0 + 60_100); // real time left is now 59.9 s, shown as 1:00
    screen.read(clock, T0 + 60_100);
    clock = startClock(clock, T0 + 90_000);
    screen.read(clock, T0 + 91_000); // 0:59
    expect(screen.heard).toEqual(['beep']);
  });

  it('sounds nothing when a reset or another speech moves the time left', () => {
    let clock = startClock(idleClock(2), T0);
    const screen = reader(clock, T0);
    screen.read(clock, T0 + 30_000); // 1:30
    // A fresh one-minute clock drops the reading from 1:30 to 1:00 without the speech running.
    clock = idleClock(1);
    screen.read(clock, T0 + 30_000);
    clock = idleClock(4);
    screen.read(clock, T0 + 30_000);
    expect(screen.heard).toEqual([]);
  });
});
