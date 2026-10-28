import { describe, expect, it } from 'vitest';
import { displaySeconds, pauseClock, remainingMs, startClock } from '@/lib/timer-clock';

describe('speech clock', () => {
  it('pausing keeps the exact remainder instead of rounding up to the next second', () => {
    let clock = startClock({ remainingMs: 60_000, deadline: null }, 0);
    clock = pauseClock(clock, 10_400);
    expect(clock).toEqual({ remainingMs: 49_600, deadline: null });

    // Pause and resume ten times at 0.9s into a second: the speaker gains nothing.
    let now = 10_400;
    for (let i = 0; i < 10; i++) {
      clock = startClock(clock, now);
      now += 900;
      clock = pauseClock(clock, now);
    }
    expect(clock.remainingMs).toBe(40_600);
    expect(displaySeconds(clock.remainingMs)).toBe(41);
  });

  it('never runs below zero', () => {
    const running = startClock({ remainingMs: 1_000, deadline: null }, 0);
    expect(remainingMs(running, 5_000)).toBe(0);
    expect(pauseClock(running, 5_000).remainingMs).toBe(0);
    expect(startClock({ remainingMs: 0, deadline: null }, 9_000).deadline).toBeNull();
  });
});
