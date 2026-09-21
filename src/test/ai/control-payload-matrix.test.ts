// Control-to-payload regression matrix (frontend half).
// Every visible AI control must reach the edge-function request payload with
// the exact selected value. The backend half of this matrix lives in
// supabase/functions/ai/control-matrix.test.ts (prompt markers +
// post-processing enforcement).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock, resetMockState, setMockSessionToken } from '../mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));

import { generateCase, attackCase, brainstorm, factoids, askChat } from '@/lib/ai/client';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import { setMockInvokeResponse } from '../mocks/supabase';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { AskOutput } from '@/lib/ai/schemas/ask';
import { useSettingsStore } from '@/lib/stores/settings-store';

const config: ProviderConfig = { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 };

const validAttackOutput: AttackOutput = {
  overallAssessment: { score: 50, summary: 's', strengthAreas: [] },
  weaknesses: [],
  fallaciesDetected: [],
  crossExQuestions: [],
  weighingAnalysis: { currentWeighing: 'w', missingComparisons: [], improvementSuggestions: [] },
};

const validFactoidsOutput: FactoidsOutput = {
  factoids: [],
  searchSuggestions: [],
  warnings: [],
  verificationStatus: 'complete',
};

const validAskOutput: AskOutput = {
  response: 'r',
  followUpQuestions: ['q'],
  uncertainties: [],
};

async function lastInvokeBody() {
  const call = supabaseMock.functions.invoke.mock.calls.at(-1) as unknown[] | undefined;
  const options = call?.[1] as { body?: Record<string, unknown> } | undefined;
  return options?.body ?? {};
}

describe('control-to-payload regression matrix', () => {
  beforeEach(() => {
    resetMockState();
    setMockSessionToken('valid-token');
    useSettingsStore.setState({ outputLanguage: 'hu' });
    vi.clearAllMocks();
    setMockSessionToken('valid-token');
  });

  it('generate sends side, role, length, audience, and tone verbatim', async () => {
    setMockInvokeResponse({
      output: {
        caseStructure: { thesis: 'T', framework: 'F', keyDefinitions: [], burdenOfProof: 'B' },
        contentions: [
          { id: '1', claim: 'A', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
          { id: '2', claim: 'B', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
          { id: '3', claim: 'C', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
          { id: '4', claim: 'D', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
        ],
        predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
        counters: [],
        metadata: { side: 'con', format: 'custom', generatedAt: '2026-01-01T00:00:00.000Z' },
      },
    });
    await generateCase(
      { motion: 'M', side: 'con', role: 'r2', length: 'comprehensive', audience: 'beginner', tone: 'conversational', format: 'custom' } as never,
      config,
    );
    const body = await lastInvokeBody();
    expect(body.feature).toBe('generate');
    expect(body.input).toMatchObject({
      side: 'con',
      role: 'r2',
      length: 'comprehensive',
      audience: 'beginner',
      tone: 'conversational',
      format: 'custom',
      language: 'hu',
    });
  });

  it('attack sends intensity, paradigm, and both toggles verbatim', async () => {
    setMockInvokeResponse({ output: validAttackOutput });
    await attackCase(
      { caseText: 'C', aggressiveness: 'ruthless', judgeParadigm: 'policy', detectFallacies: false, analyzeWeighing: true } as never,
      config,
    );
    const body = await lastInvokeBody();
    expect(body.input).toMatchObject({
      caseText: 'C',
      aggressiveness: 'ruthless',
      judgeParadigm: 'policy',
      detectFallacies: false,
      analyzeWeighing: true,
      language: 'hu',
    });
  });

  it('brainstorm sends side and output mode verbatim', async () => {
    await brainstorm({ motion: 'M', side: 'both', outputMode: 'buckets', context: 'ctx' } as never, config);
    const body = await lastInvokeBody();
    expect(body.input).toMatchObject({ motion: 'M', side: 'both', outputMode: 'buckets', context: 'ctx', language: 'hu' });
  });

  it('factoids sends direction, source type, timeframe, region, and source count verbatim', async () => {
    setMockInvokeResponse({ output: validFactoidsOutput });
    await factoids(
      { claim: 'C', direction: 'against', sourceType: 'academic', timeframe: '2020-2026', region: 'EU', sourceCount: 9 } as never,
      config,
    );
    const body = await lastInvokeBody();
    expect(body.input).toMatchObject({
      claim: 'C',
      direction: 'against',
      sourceType: 'academic',
      timeframe: '2020-2026',
      region: 'EU',
      sourceCount: 9,
      language: 'hu',
    });
  });

  it('ask sends mode plus all four toggles verbatim', async () => {
    setMockInvokeResponse({ output: validAskOutput });
    await askChat('Hello', [], 'clarify', config, {
      citationMode: true,
      webSearch: true,
      prosConsMode: false,
      argumentMapMode: true,
    });
    const body = await lastInvokeBody();
    expect(body.input).toMatchObject({
      message: 'Hello',
      mode: 'clarify',
      citationMode: true,
      webSearch: true,
      prosConsMode: false,
      argumentMapMode: true,
      language: 'hu',
    });
  });

  it('ask defaults every toggle to false when unset so backend enforcement stays deterministic', async () => {
    setMockInvokeResponse({ output: validAskOutput });
    await askChat('Hello', [], 'general', config);
    const body = await lastInvokeBody();
    expect(body.input).toMatchObject({
      citationMode: false,
      webSearch: false,
      prosConsMode: false,
      argumentMapMode: false,
      language: 'hu',
    });
  });
});
