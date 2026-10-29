import { describe, expect, it } from 'vitest';

import { ARRIVAL_WINDOW_MS, createRowArrivals } from './row-arrivals';

function clock() {
  let time = 1_000;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('createRowArrivals', () => {
  it('animates the first load, but not rows scrolled to after it settled', () => {
    const time = clock();
    const arrivals = createRowArrivals(time.now);
    arrivals.update(['a', 'b', 'c']);
    expect(arrivals.entersNow('a')).toBe(true);
    time.advance(ARRIVAL_WINDOW_MS);
    // Row c mounts only now, scrolled into view: it is just there.
    expect(arrivals.entersNow('c')).toBe(false);
  });

  it('animates a row added later, once, while the others stay put', () => {
    const time = clock();
    const arrivals = createRowArrivals(time.now);
    arrivals.update(['a', 'b']);
    time.advance(5_000);
    arrivals.update(['new', 'a', 'b']);
    expect(arrivals.entersNow('new')).toBe(true);
    expect(arrivals.entersNow('a')).toBe(false);
    time.advance(ARRIVAL_WINDOW_MS);
    expect(arrivals.entersNow('new')).toBe(false);
  });

  it('treats a row a filter brings back as arriving again', () => {
    const time = clock();
    const arrivals = createRowArrivals(time.now);
    arrivals.update(['a', 'b']);
    time.advance(5_000);
    arrivals.update(['a']);
    time.advance(100);
    arrivals.update(['a', 'b']);
    expect(arrivals.entersNow('b')).toBe(true);
    expect(arrivals.entersNow('a')).toBe(false);
  });

  it('does not restart a row when the same keys come in again on another render', () => {
    const time = clock();
    const arrivals = createRowArrivals(time.now);
    arrivals.update(['a']);
    time.advance(ARRIVAL_WINDOW_MS - 1);
    arrivals.update(['a']);
    time.advance(1);
    expect(arrivals.entersNow('a')).toBe(false);
  });

  it('knows nothing of keys that are not in the list', () => {
    const arrivals = createRowArrivals(clock().now);
    arrivals.update(['a']);
    expect(arrivals.entersNow('gone')).toBe(false);
  });
});
