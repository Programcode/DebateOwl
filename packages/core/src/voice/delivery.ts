import { z } from 'zod';
import type { AppLanguage } from '../languages';

/**
 * Facts measured while a student speaks a turn aloud: the clock and the
 * browser's transcript, nothing else. Nobody hears the audio, so nothing here
 * describes tone, confidence, or volume.
 */
export const SpeechDeliverySchema = z.object({
  speakingSeconds: z.number().int().min(0).max(86_400),
  wordCount: z.number().int().min(0).max(6_000),
  wordsPerMinute: z.number().int().min(0).max(600),
  fillerCount: z.number().int().min(0).max(6_000),
  fillers: z.array(z.object({
    word: z.string().trim().min(1).max(40),
    count: z.number().int().min(1).max(6_000),
  }).strict()).max(12),
  longPauses: z.number().int().min(0).max(1_000),
  longestPauseSeconds: z.number().int().min(0).max(86_400),
}).strict();
export type SpeechDelivery = z.infer<typeof SpeechDeliverySchema>;

/** A silence at least this long between recognised words counts as a long pause. */
export const LONG_PAUSE_SECONDS = 3;
const MAX_REPORTED_FILLERS = 12;

// Hesitation sounds and filler phrases per language. Words that are often
// real content ("like", "este", "bueno") are left out: a measured count
// should not accuse a student of a filler they did not use.
const FILLERS: Record<AppLanguage, readonly string[]> = {
  en: ['um', 'uh', 'er', 'erm', 'hmm', 'you know', 'I mean', 'sort of', 'kind of', 'basically', 'literally'],
  es: ['eh', 'em', 'ehm', 'mmm', 'o sea', 'en plan', 'a ver', 'digamos', 'pues'],
  hu: ['ööö', 'hát', 'izé', 'szóval', 'ugye', 'úgymond', 'tulajdonképpen'],
};

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
}

// "ummm" and "um" are the same hesitation, so runs of one letter collapse.
function collapse(word: string): string {
  return word.replace(/(.)\1+/gu, '$1');
}

interface FillerPattern {
  label: string;
  tokens: string[];
}

const FILLER_PATTERNS = Object.fromEntries(
  (Object.entries(FILLERS) as Array<[AppLanguage, readonly string[]]>).map(([language, fillers]) => [
    language,
    fillers
      .map((label): FillerPattern => ({ label, tokens: words(label).map(collapse) }))
      // Longer phrases first, so "you know" is not split.
      .sort((left, right) => right.tokens.length - left.tokens.length),
  ]),
) as Record<AppLanguage, FillerPattern[]>;

export function countWords(text: string): number {
  return words(text).length;
}

export function countFillers(text: string, language: AppLanguage): Array<{ word: string; count: number }> {
  const tokens = words(text).map(collapse);
  const counts = new Map<string, number>();
  for (let index = 0; index < tokens.length;) {
    const match = FILLER_PATTERNS[language].find((pattern) =>
      pattern.tokens.every((token, offset) => tokens[index + offset] === token));
    if (match) {
      counts.set(match.label, (counts.get(match.label) ?? 0) + 1);
      index += match.tokens.length;
    } else {
      index += 1;
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
    .slice(0, MAX_REPORTED_FILLERS);
}

/** What one or more microphone takes within a turn recorded. */
export interface SpeechTake {
  /** Everything the browser transcribed, before any manual edits. */
  text: string;
  /** Time the microphone was listening. */
  speakingMs: number;
  /** Silences between recognised words of at least LONG_PAUSE_SECONDS. */
  pausesMs: number[];
}

/** Turn a take into delivery facts; null when nothing was spoken. */
export function measureDelivery(take: SpeechTake, language: AppLanguage): SpeechDelivery | null {
  const wordCount = Math.min(countWords(take.text), 6_000);
  if (wordCount === 0) return null;
  const speakingSeconds = Math.min(86_400, Math.max(1, Math.round(take.speakingMs / 1_000)));
  const fillers = countFillers(take.text, language);
  return {
    speakingSeconds,
    wordCount,
    wordsPerMinute: Math.min(600, Math.round(wordCount / (speakingSeconds / 60))),
    fillerCount: fillers.reduce((total, filler) => total + filler.count, 0),
    fillers,
    longPauses: Math.min(1_000, take.pausesMs.length),
    longestPauseSeconds: Math.min(86_400, Math.round(Math.max(0, ...take.pausesMs) / 1_000)),
  };
}

/** Add up the facts from several spoken turns, for a round-level summary. */
export function combineDelivery(deliveries: SpeechDelivery[]): SpeechDelivery | null {
  if (deliveries.length === 0) return null;
  const speakingSeconds = deliveries.reduce((total, item) => total + item.speakingSeconds, 0);
  const wordCount = deliveries.reduce((total, item) => total + item.wordCount, 0);
  const fillerCounts = new Map<string, number>();
  for (const item of deliveries) {
    for (const filler of item.fillers) fillerCounts.set(filler.word, (fillerCounts.get(filler.word) ?? 0) + filler.count);
  }
  return {
    speakingSeconds,
    wordCount,
    wordsPerMinute: speakingSeconds > 0 ? Math.min(600, Math.round(wordCount / (speakingSeconds / 60))) : 0,
    fillerCount: deliveries.reduce((total, item) => total + item.fillerCount, 0),
    fillers: [...fillerCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
      .slice(0, MAX_REPORTED_FILLERS),
    longPauses: deliveries.reduce((total, item) => total + item.longPauses, 0),
    longestPauseSeconds: Math.max(...deliveries.map((item) => item.longestPauseSeconds)),
  };
}
