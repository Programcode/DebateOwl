import { describe, expect, it } from 'vitest';
import { FORMATS } from '@/lib/free-tools/formats';
import { countWords, slotFits, spokenSeconds, wordsForSlot } from '@/lib/free-tools/speech-time';

describe('speech time calculator', () => {
  it('counts words the way a reader would', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
    expect(countWords("We don't accept the well-known claim — not in 2026.")).toBe(9);
    expect(countWords('• First point\n• Second point')).toBe(4);
    expect(countWords('Az iskolák több szünetet érdemelnek, ¿verdad?')).toBe(6);
    expect(countWords('GDP grew 3.5% in the U.S.')).toBe(6);
  });

  it('converts words to spoken time at a pace', () => {
    expect(spokenSeconds(520, 130)).toBe(240);
    expect(spokenSeconds(110, 110)).toBe(60);
    expect(spokenSeconds(100, 0)).toBe(0);
    expect(wordsForSlot(240, 130)).toBe(520);
  });

  it('reports which speech slots a speech fits and by how much it runs over', () => {
    // 450 words at 130 wpm is 3:28.
    const fits = slotFits(450, 130, [FORMATS.pf, FORMATS.ld]);
    expect(fits.find((fit) => fit.formatId === 'pf' && fit.slotSeconds === 240)).toMatchObject({
      roles: 'constructive / rebuttal', spareSeconds: 32, fits: true,
    });
    expect(fits.find((fit) => fit.formatId === 'pf' && fit.slotSeconds === 120)).toMatchObject({
      roles: 'final focus', spareSeconds: -88, fits: false,
    });
    expect(fits.find((fit) => fit.formatId === 'ld' && fit.slotSeconds === 180)).toMatchObject({ roles: '2AR', spareSeconds: -28 });
    // Questioning periods are not speeches you write.
    expect(fits.filter((fit) => fit.formatId === 'pf').map((fit) => fit.slotSeconds)).toEqual([240, 180, 120]);
  });
});
