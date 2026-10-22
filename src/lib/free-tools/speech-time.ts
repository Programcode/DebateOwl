/** Word counts and spoken-duration estimates for the speech time calculator. */
import { segmentRole, speakingSegments, type RoundFormat } from './formats';

/** Rough speaking rates. These are working approximations for practice, not measured norms. */
export const PACES = [
  { id: 'slow', wpm: 110 },
  { id: 'average', wpm: 130 },
  { id: 'fast', wpm: 160 },
] as const;
export type PaceId = (typeof PACES)[number]['id'];

export const MIN_WPM = 60;
export const MAX_WPM = 400;

/** Words as a reader counts them: "don't", "well-known" and "2026" are one word each; dashes and bullets are none. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’\-.][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function spokenSeconds(words: number, wpm: number): number {
  if (!(wpm > 0)) return 0;
  return (words / wpm) * 60;
}

export interface SlotFit {
  formatId: string;
  formatShortName: string;
  /** The speeches of this length, by role: "constructive / rebuttal". */
  roles: string;
  slotSeconds: number;
  /** Positive when the speech fits with time to spare; negative when it runs over. */
  spareSeconds: number;
  fits: boolean;
}

/**
 * How a speech of `words` words at `wpm` fits each distinct speech length in
 * the formats, one row per format and length.
 */
export function slotFits(words: number, wpm: number, formats: readonly RoundFormat[]): SlotFit[] {
  const spoken = spokenSeconds(words, wpm);
  return formats.flatMap((format) => {
    const byLength = new Map<number, string[]>();
    for (const segment of speakingSegments(format)) {
      const roles = byLength.get(segment.seconds) ?? [];
      const role = segmentRole(segment);
      if (!roles.includes(role)) roles.push(role);
      byLength.set(segment.seconds, roles);
    }
    return [...byLength].map(([slotSeconds, roles]) => {
      const spareSeconds = Math.round(slotSeconds - spoken);
      return { formatId: format.id, formatShortName: format.shortName, roles: roles.join(' / '), slotSeconds, spareSeconds, fits: spareSeconds >= 0 };
    });
  });
}

/** Words that fill a slot at a pace: the target length for a speech you are writing. */
export function wordsForSlot(slotSeconds: number, wpm: number): number {
  return Math.round((slotSeconds / 60) * wpm);
}
