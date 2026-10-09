/** Focus refreshes usually reread unchanged data; returning the previous value keeps its identity, so nothing re-renders. */
export function keepIfSame<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}
