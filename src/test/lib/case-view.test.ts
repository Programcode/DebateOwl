import { describe, expect, it } from 'vitest';
import { GenerateOutputSchema } from '@/lib/ai/schemas/generate';
import { mergeCaseSources, readCase } from '@debatelab/core/ai/case-view';
import { prefillFromGenerate } from '@/lib/crossfire/prefill';
import { NEW_CASE, OLD_CASE } from '../helpers/cases';

describe('generated case schema', () => {
  it('accepts a new case without any of the old sections', () => {
    expect(GenerateOutputSchema.safeParse(NEW_CASE).success).toBe(true);
  });

  it('still accepts a case saved before the restructure, keeping its old sections', () => {
    const parsed = GenerateOutputSchema.parse(OLD_CASE);
    expect(parsed.caseStructure.burdenOfProof).toBe('We must show a net gain in practice.');
    expect(parsed.predictedOpponentCase?.keyClashes).toEqual(['Who bears the cost.']);
    expect(parsed.counters[0].rebuttal).toBe('Net cost is far below headline farebox revenue.');
  });

  it('accepts null where the model was told to leave a field out', () => {
    const parsed = GenerateOutputSchema.parse({
      ...NEW_CASE,
      opening: { hook: 'Hook', definition: null },
      contentions: [{ ...NEW_CASE.contentions[0], title: null }],
      counters: [{ ...NEW_CASE.counters[0], source: null }],
      whyWeWin: null,
      closingLine: null,
      sources: [{ org: 'UNICEF', year: null, claim: 'Claim', url: null }],
    });
    const view = readCase(parsed);
    expect(view.opening.definition).toBeUndefined();
    expect(view.arguments[0].title).toBeUndefined();
    expect(view.whyWeWin).toEqual([]);
    expect(view.sources).toEqual([{ org: 'UNICEF', claim: 'Claim', year: undefined, url: undefined }]);
  });

  it('keeps the new sections instead of stripping them as unknown keys', () => {
    const parsed = GenerateOutputSchema.parse({ ...NEW_CASE, whyWeWin: ['They never answered our point.'] });
    expect(parsed.opening?.hook).toBe(NEW_CASE.opening?.hook);
    expect(parsed.contentions[0].title).toBe('One size fits all');
    expect(parsed.counters[0].source).toBe('OECD, 2024');
    expect(parsed.whyWeWin).toEqual(['They never answered our point.']);
    expect(parsed.closingLine).toBe(NEW_CASE.closingLine);
    expect(parsed.sources).toHaveLength(2);
  });
});

describe('readCase', () => {
  it('reads a new case into its sections and never links a non-web URL', () => {
    const view = readCase(NEW_CASE);
    expect(view.opening).toEqual({ hook: NEW_CASE.opening?.hook, definition: undefined, roadmap: NEW_CASE.caseStructure.thesis });
    expect(view.arguments[0]).toMatchObject({ title: 'One size fits all', point: 'A total ban ignores that children grow up.' });
    expect(view.ifTheySay).toEqual([{ theySay: 'AI makes kids cheat.', weAnswer: NEW_CASE.counters[0].counterpoint, inRound: undefined, source: 'OECD, 2024' }]);
    expect(view.sources.map((source) => source.url)).toEqual(['https://www.unicef.org/report', undefined]);
    expect(view.legacy).toEqual({ framework: undefined, burdenOfProof: undefined, definitions: [], likelyArguments: [], weaknesses: [], clashes: [] });
  });

  it('reads an old case: exordio becomes the hook and the old sections come through as legacy', () => {
    const view = readCase(OLD_CASE);
    expect(view.opening.hook).toBe('Imagine a city where the bus is free. That city is closer than you think.');
    expect(view.opening.roadmap).toBe('Free transit is a net public good.');
    expect(view.ifTheySay[0]).toMatchObject({ theySay: 'Funding gap', weAnswer: 'Fare collection has heavy overhead.', inRound: 'Net cost is far below headline farebox revenue.' });
    expect(view.legacy).toEqual({
      framework: 'Net societal benefit.',
      burdenOfProof: 'We must show a net gain in practice.',
      definitions: ['Public transport: publicly funded scheduled transit.'],
      // "Funding gap" is already answered in the list, so only the unanswered one stays.
      likelyArguments: ['Overcrowding'],
      weaknesses: ['Assumes fares are the only funding model.'],
      clashes: ['Who bears the cost.'],
    });
  });

  it('survives a stored case with missing or malformed sections', () => {
    const broken = { caseStructure: { thesis: '' }, contentions: [null], counters: [{}], sources: [{}], metadata: {} } as unknown as typeof NEW_CASE;
    const view = readCase(broken);
    expect(view.arguments).toHaveLength(1);
    expect(view.ifTheySay).toEqual([]);
    expect(view.sources).toEqual([]);
    expect(view.opening.roadmap).toBeUndefined();
  });
});

describe('mergeCaseSources', () => {
  it('keeps both lists after a section regenerates, each source once', () => {
    const merged = mergeCaseSources(NEW_CASE.sources, [
      { org: 'UNICEF', year: '2025', claim: 'Same report, new wording', url: 'https://www.unicef.org/report' },
      { org: 'OECD', year: '2024', claim: 'Cheating predates AI' },
    ]);
    expect(merged?.map((source) => source.org)).toEqual(['UNICEF', 'OECD', 'Old Wiki']);
    expect(mergeCaseSources(undefined, [])).toBeUndefined();
  });
});

describe('Crossfire prefill from a case', () => {
  it('leaves out empty old sections and includes a Conclusor\'s reasons', () => {
    const fresh = prefillFromGenerate('Motion', { ...NEW_CASE, contentions: [], whyWeWin: ['They never answered our point.'] });
    expect(fresh.argument).not.toContain('Framework');
    expect(fresh.argument).not.toContain('Burden of proof');
    expect(fresh.argument).toContain('Why we win 1: They never answered our point.');

    const old = prefillFromGenerate('Motion', OLD_CASE);
    expect(old.argument).toContain('Burden of proof: We must show a net gain in practice.');
  });
});
