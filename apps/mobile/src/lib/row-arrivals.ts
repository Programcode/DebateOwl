/**
 * When a row of a virtualized list should play its arrival (ListItemIn's fade up).
 * A FlatList mounts rows as they scroll into view and unmounts them again, so a
 * row that animated on mount would replay every time it came back. Here a row
 * arrives when its key joins the list's data (the first load, a new source, a
 * filter that brings it back), and it plays the arrival only if it mounts soon
 * after; a row scrolled to later is simply there. No React Native imports, so it
 * is unit-tested in Node.
 */

/** Long enough for the first screenful's stagger (eight steps of 40 ms) and its mount. */
export const ARRIVAL_WINDOW_MS = 700;

export type RowArrivals = {
  /** The list's keys, in order, on each render. Calling it again with the same keys changes nothing. */
  update: (keys: readonly string[]) => void;
  /** Whether a row mounting now arrives with its animation. */
  entersNow: (key: string) => boolean;
};

export function createRowArrivals(now: () => number = Date.now): RowArrivals {
  let previous = new Set<string>();
  const arrivedAt = new Map<string, number>();
  return {
    update(keys) {
      const next = new Set(keys);
      const at = now();
      for (const key of next) if (!previous.has(key)) arrivedAt.set(key, at);
      for (const key of arrivedAt.keys()) if (!next.has(key)) arrivedAt.delete(key);
      previous = next;
    },
    entersNow(key) {
      const at = arrivedAt.get(key);
      return at !== undefined && now() - at < ARRIVAL_WINDOW_MS;
    },
  };
}
