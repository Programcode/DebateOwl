import { describe, expect, it } from 'vitest';
import { prefillFromAttack, prefillFromGenerate } from '@/lib/crossfire/prefill';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

describe('Crossfire result prefill', () => {
  it('turns a generated case into a bounded argument with its resolution', () => {
    const result: GenerateOutput = {
      caseStructure: { thesis: 'Ban cars', framework: 'Safety', keyDefinitions: [], burdenOfProof: 'Show safer streets' },
      contentions: [{ id: '1', claim: 'Cars injure people', reasoning: 'Exposure creates risk', evidence: 'Collision records', needsSource: false, impact: 'Fewer injuries' }],
      predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
      counters: [],
      metadata: { side: 'pro', format: 'custom', generatedAt: '2026-01-01T00:00:00Z' },
    };
    const prefill = prefillFromGenerate('Resolved: ban cars', result);
    expect(prefill.resolution).toBe('Resolved: ban cars');
    expect(prefill.argument).toContain('Thesis: Ban cars');
    expect(prefill.argument).toContain('Contention 1: Cars injure people');
  });

  it('carries the attacked case and generated cross-ex questions', () => {
    const result: AttackOutput = {
      overallAssessment: { score: 60, summary: 'Mixed', strengthAreas: [] },
      weaknesses: [],
      fallaciesDetected: [],
      crossExQuestions: [
        { question: 'What is the mechanism?', purpose: 'Test causation', expectedTrap: 'No warrant' },
        { question: 'Who pays?', purpose: 'Test costs', expectedTrap: 'No funding' },
      ],
      weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
    };
    const prefill = prefillFromAttack('The original case.', result);
    expect(prefill.argument).toBe('The original case.');
    expect(prefill.seedQuestions).toEqual(['What is the mechanism?', 'Who pays?']);
  });

  it('bounds oversized Attack question sets instead of throwing from the result action', () => {
    const result: AttackOutput = {
      overallAssessment: { score: 60, summary: 'Mixed', strengthAreas: [] },
      weaknesses: [],
      fallaciesDetected: [],
      crossExQuestions: Array.from({ length: 11 }, (_, index) => ({
        question: `${index}: ${'q'.repeat(2_100)}`,
        purpose: 'Test the argument',
        expectedTrap: 'Missing warrant',
      })),
      weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
    };
    const prefill = prefillFromAttack('The original case.', result);
    expect(prefill.seedQuestions).toHaveLength(10);
    expect(prefill.seedQuestions?.every((question) => question.length <= 2_000)).toBe(true);
  });
});
