import { describe, expect, it } from 'vitest';
import { combineDelivery, countFillers, countWords, measureDelivery, SpeechDeliverySchema } from '@/lib/voice/delivery';

describe('spoken delivery facts', () => {
  it('counts English hesitations and filler phrases, however long the hesitation is drawn out', () => {
    const fillers = countFillers('Ummm so, you know, the policy, uh, basically works. Um, you know it does.', 'en');
    expect(fillers).toEqual([
      { word: 'um', count: 2 },
      { word: 'you know', count: 2 },
      { word: 'basically', count: 1 },
      { word: 'uh', count: 1 },
    ]);
  });

  it('does not count ordinary words that only resemble a filler', () => {
    expect(countFillers('I like the umbrella policy and I know you did the summary.', 'en')).toEqual([]);
    expect(countFillers('Este argumento es bueno.', 'es')).toEqual([]);
  });

  it('uses the filler list of the language spoken', () => {
    expect(countFillers('Pues, o sea, el coste, eh, es alto. O sea, mucho.', 'es')).toEqual([
      { word: 'o sea', count: 2 },
      { word: 'eh', count: 1 },
      { word: 'pues', count: 1 },
    ]);
    expect(countFillers('Hát, szóval az ár, ööö, ugye magas. Hát igen.', 'hu')).toEqual([
      { word: 'hát', count: 2 },
      { word: 'ööö', count: 1 },
      { word: 'szóval', count: 1 },
      { word: 'ugye', count: 1 },
    ]);
    // Spanish fillers are not looked for in an English speech.
    expect(countFillers('Pues the cost is high.', 'en')).toEqual([]);
  });

  it('counts words in any of the supported languages', () => {
    expect(countWords("It's a three-word... test")).toBe(5);
    expect(countWords('Tulajdonképpen működik, ¿verdad?')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });

  it('measures time, pace, fillers, and long pauses from one take', () => {
    const text = `${'word '.repeat(268)}um um`;
    const delivery = measureDelivery({ text, speakingMs: 120_400, pausesMs: [3_200, 6_700] }, 'en');
    expect(delivery).toEqual({
      speakingSeconds: 120,
      wordCount: 270,
      wordsPerMinute: 135,
      fillerCount: 2,
      fillers: [{ word: 'um', count: 2 }],
      longPauses: 2,
      longestPauseSeconds: 7,
    });
    expect(SpeechDeliverySchema.safeParse(delivery).success).toBe(true);
  });

  it('reports nothing when nothing was spoken', () => {
    expect(measureDelivery({ text: '  ', speakingMs: 9_000, pausesMs: [] }, 'en')).toBeNull();
  });

  it('keeps impossible paces inside the schema', () => {
    const delivery = measureDelivery({ text: 'word '.repeat(50), speakingMs: 200, pausesMs: [] }, 'en');
    expect(delivery?.wordsPerMinute).toBe(600);
    expect(SpeechDeliverySchema.safeParse(delivery).success).toBe(true);
  });

  it('adds several spoken turns into one summary', () => {
    const first = measureDelivery({ text: `${'word '.repeat(58)}um um`, speakingMs: 30_000, pausesMs: [4_000] }, 'en')!;
    const second = measureDelivery({ text: `${'word '.repeat(89)}um`, speakingMs: 30_000, pausesMs: [] }, 'en')!;
    expect(combineDelivery([first, second])).toEqual({
      speakingSeconds: 60,
      wordCount: 150,
      wordsPerMinute: 150,
      fillerCount: 3,
      fillers: [{ word: 'um', count: 3 }],
      longPauses: 1,
      longestPauseSeconds: 4,
    });
    expect(combineDelivery([])).toBeNull();
  });
});
