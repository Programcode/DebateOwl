import { describe, expect, it } from 'vitest';

import { mergeRegeneratedSection } from './generate-output';
import type { GenerateOutput } from './schemas/generate';

const metadata = { side: 'pro' as const, format: 'custom', generatedAt: '2026-10-28T10:00:00.000Z' };

describe('mergeRegeneratedSection', () => {
  it('keeps an R2 case body when regenerating an older case whose body was in its arguments', () => {
    // A pre-v2 R2 case: its body was three ordinary arguments.
    const older: GenerateOutput = {
      caseStructure: { thesis: 'Back up our case' },
      contentions: [{ id: '1', claim: 'Air', reasoning: 'r', evidence: 'e', needsSource: false, impact: 'i' }],
      counters: [],
      metadata,
    };
    // A new R2 run answers with the backed-up arguments and no new ones.
    const fresh: GenerateOutput = {
      caseStructure: { thesis: 'Back up our case' },
      contentions: [],
      reinforce: [{ argument: 'Our first argument: clean air', text: 'Roadside NO2 fell within a year.' }],
      counters: [],
      metadata,
    };
    const merged = mergeRegeneratedSection(older, fresh, 'contentions');
    expect(merged.contentions).toEqual([]);
    expect(merged.reinforce).toEqual(fresh.reinforce);
  });
});
