import { describe, expect, it } from 'vitest';
import { buildSparringTurns, formatRoundTime, getSparringFormat } from '@/lib/sparring/formats';
import type { SparringFormat, SparringSide } from '@/lib/ai/schemas/sparring';

const EXPECTED_TURNS: Record<SparringFormat, Array<{
  label: string;
  side: SparringSide;
  kind: string;
  seconds: number;
}>> = {
  standard: [
    { label: 'Pro opening', side: 'pro', kind: 'opening', seconds: 240 },
    { label: 'Con opening', side: 'con', kind: 'opening', seconds: 240 },
    { label: 'Pro first constructive', side: 'pro', kind: 'constructive', seconds: 360 },
    { label: 'Con first constructive', side: 'con', kind: 'constructive', seconds: 360 },
    { label: 'Pro second constructive', side: 'pro', kind: 'rebuttal', seconds: 360 },
    { label: 'Con second constructive', side: 'con', kind: 'rebuttal', seconds: 360 },
    { label: 'Pro conclusion', side: 'pro', kind: 'final', seconds: 180 },
    { label: 'Con conclusion', side: 'con', kind: 'final', seconds: 180 },
  ],
  ld: [
    { label: 'Affirmative constructive', side: 'pro', kind: 'constructive', seconds: 360 },
    { label: 'Negative constructive', side: 'con', kind: 'constructive', seconds: 420 },
    { label: 'First affirmative rebuttal', side: 'pro', kind: 'rebuttal', seconds: 240 },
    { label: 'Negative rebuttal', side: 'con', kind: 'rebuttal', seconds: 360 },
    { label: 'Second affirmative rebuttal', side: 'pro', kind: 'final', seconds: 180 },
  ],
  pf: [
    { label: 'Pro constructive', side: 'pro', kind: 'constructive', seconds: 240 },
    { label: 'Con constructive', side: 'con', kind: 'constructive', seconds: 240 },
    { label: 'Pro rebuttal', side: 'pro', kind: 'rebuttal', seconds: 240 },
    { label: 'Con rebuttal', side: 'con', kind: 'rebuttal', seconds: 240 },
    { label: 'Pro summary', side: 'pro', kind: 'summary', seconds: 180 },
    { label: 'Con summary', side: 'con', kind: 'summary', seconds: 180 },
    { label: 'Pro final focus', side: 'pro', kind: 'final', seconds: 120 },
    { label: 'Con final focus', side: 'con', kind: 'final', seconds: 120 },
  ],
};

describe('sparring formats', () => {
  it.each(Object.entries(EXPECTED_TURNS) as Array<[SparringFormat, typeof EXPECTED_TURNS.standard]>)('builds the exact %s schedule', (format, expected) => {
      for (const userSide of ['pro', 'con'] as const) {
        const turns = buildSparringTurns(format, userSide);

        expect(turns).toHaveLength(expected.length);
        expect(turns.map(({ label, side, kind, timeLimitSeconds }) => ({
          label,
          side,
          kind,
          seconds: timeLimitSeconds,
        }))).toEqual(expected);
        expect(turns.map((turn) => turn.id)).toEqual(
          expected.map((_, index) => `${format}-${index + 1}`),
        );
        expect(turns.map((turn) => turn.speaker)).toEqual(
          expected.map((turn) => turn.side === userSide ? 'user' : 'ai'),
        );
      }
    });

  it('exposes format metadata that agrees with the schedule', () => {
    for (const [format, expected] of Object.entries(EXPECTED_TURNS) as Array<[SparringFormat, typeof EXPECTED_TURNS.standard]>) {
      const definition = getSparringFormat(format);
      expect(definition.id).toBe(format);
      expect(definition.turnCount).toBe(expected.length);
      expect(definition.name).toBeTruthy();
      expect(definition.shortDescription).toBeTruthy();
      expect(definition.approximateMinutes).toBeGreaterThan(0);
    }
  });

  it.each([
    [0, '0:00'],
    [1, '0:01'],
    [59, '0:59'],
    [60, '1:00'],
    [241, '4:01'],
    [-1, '0:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatRoundTime(seconds)).toBe(expected);
  });
});
