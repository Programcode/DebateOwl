import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

/**
 * Asks for an App Store rating through Apple's own prompt, at a good moment:
 * a few seconds after a finished result has opened, never in the middle of
 * work. Only from the third finished result on, and at most every 120 days.
 * iOS shows the prompt at most three times a year and not at all in Expo Go
 * or TestFlight, and decides by itself whether to show it, so this only
 * offers.
 */

const KEY = 'debateowl.review-prompt';
const FIRST_AFTER = 3;
const MIN_GAP_MS = 120 * 24 * 60 * 60_000;
const DELAY_MS = 2_500;

type Stored = { wins: number; askedAt: number | null };

async function read(): Promise<Stored> {
  try {
    const value: unknown = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    const { wins, askedAt } = (value ?? {}) as Record<string, unknown>;
    return { wins: typeof wins === 'number' ? wins : 0, askedAt: typeof askedAt === 'number' ? askedAt : null };
  } catch {
    return { wins: 0, askedAt: null };
  }
}

/** Whether to offer the prompt now, after counting this result. */
export function shouldAskForReview(stored: Stored, now: number): boolean {
  if (stored.wins < FIRST_AFTER) return false;
  return stored.askedAt === null || now - stored.askedAt >= MIN_GAP_MS;
}

/** Counts a finished result (a case, an attack, a brainstorm, factoids, a judged round) and may offer the prompt. */
export function noteFinishedResult(): void {
  void (async () => {
    try {
      const stored = await read();
      const next = { ...stored, wins: stored.wins + 1 };
      const now = Date.now();
      const ask = shouldAskForReview(next, now) && (await StoreReview.hasAction());
      await AsyncStorage.setItem(KEY, JSON.stringify(ask ? { ...next, askedAt: now } : next));
      if (ask) setTimeout(() => void StoreReview.requestReview().catch(() => {}), DELAY_MS);
    } catch (cause) {
      console.warn('Could not count the result for the review prompt:', cause instanceof Error ? cause.message : cause);
    }
  })();
}
