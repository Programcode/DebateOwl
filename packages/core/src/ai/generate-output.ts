import { mergeCaseSources } from './case-view';
import type { GenerateInput, GenerateOutput } from './schemas/generate';

function cleanGeneratedString(value: string) {
  return value
    .replace(/[—–]/g, ', ')
    .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanGeneratedOutput<T>(value: T): T {
  if (typeof value === 'string') return cleanGeneratedString(value) as T;
  if (Array.isArray(value)) return value.map(cleanGeneratedOutput) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cleanGeneratedOutput(child)])
    ) as T;
  }
  return value;
}

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
export function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
  // Already in the expected shape (a new case, or an older one with its extra sections).
  if (response.caseStructure && response.contentions && response.counters && response.metadata) {
    const result = response as unknown as GenerateOutput;
    if (response.exordio && typeof response.exordio === 'object') {
      const ex = response.exordio as Record<string, unknown>;
      result.exordio = {
        hook: String(ex.hook || ''),
        transition: String(ex.transition || ''),
      };
    }
    return cleanGeneratedOutput(result);
  }

  // Transform from wrong format to correct format
  const wrongFormatContentions = response.contentions as Array<{
    title?: string;
    claim?: string;
    points?: string[];
    evidence?: string[] | string;
    analysis?: string;
    reasoning?: string;
    impact?: string;
  }> || [];

  const transformedContentions = wrongFormatContentions.map((c, i) => ({
    id: String(i + 1),
    claim: c.claim || c.title || 'Argument',
    reasoning: c.reasoning || c.analysis || (Array.isArray(c.points) ? c.points.join(' ') : ''),
    evidence: Array.isArray(c.evidence) ? c.evidence.join(' ') : (c.evidence || ''),
    needsSource: false,
    sourceQuery: '',
    impact: c.impact || c.analysis || '',
  }));

  // Transform rebuttals to "If they say…" answers
  const rebuttals = (response.rebuttals as Array<{ attack?: string; response?: string }>) || [];
  const counters = rebuttals
    .filter((r) => r.attack || r.response)
    .map((r) => ({ targetArgument: r.attack || '', counterpoint: r.response || '' }));

  const result: GenerateOutput = {
    caseStructure: {
      thesis: (response.thesis as string) || (response.title as string) || '',
    },
    contentions: transformedContentions.length > 0 ? transformedContentions : [{
      id: '1',
      claim: 'Main argument',
      reasoning: 'Reasoning here',
      evidence: 'Evidence here',
      needsSource: false,
      sourceQuery: '',
      impact: 'Impact here',
    }],
    counters,
    metadata: {
      side: (response.side as 'pro' | 'con') || 'pro',
      format: 'custom',
      generatedAt: new Date().toISOString(),
    },
  };

  // Preserve exordio if present in the original response
  if (response.exordio && typeof response.exordio === 'object') {
    const ex = response.exordio as Record<string, unknown>;
    result.exordio = {
      hook: String(ex.hook || ''),
      transition: String(ex.transition || ''),
    };
  }

  return cleanGeneratedOutput(result);
}

export function expectedContentionCount(length: GenerateInput['length']): number {
  switch (length) {
    case 'standard':
      return 3;
    case 'comprehensive':
      return 4;
    case 'brief':
    default:
      return 2;
  }
}

/**
 * Whether a case has the argument count its length asks for. R2 backs up the
 * team's arguments and a Conclusor sums up why we win, so neither brings new
 * arguments. An older backend still sends both the usual argument count.
 */
export function hasExpectedArguments(result: GenerateOutput, input: Pick<GenerateInput, 'length' | 'role'>): boolean {
  const noNewArguments = (input.role === 'r2' && Boolean(result.reinforce?.length))
    || (input.role === 'conc' && Boolean(result.whyWeWin?.length));
  return noNewArguments || result.contentions.length === expectedContentionCount(input.length);
}

/** The parts of a case Regenerate can replace one at a time, as the website's section cards name them. */
export type CaseSection = 'opening' | 'contentions' | 'counters' | 'reinforce' | 'whyWeWin' | 'closing';

/**
 * A case with one part taken from a newly generated one, as the website's
 * Regenerate merges it. The metadata comes from the new run, and the sources
 * list keeps both runs' sources.
 */
export function mergeRegeneratedSection(base: GenerateOutput, next: GenerateOutput, section: CaseSection): GenerateOutput {
  return {
    ...base,
    // A new opening replaces an older case's exordio and its framework, burden and definitions.
    ...(section === 'opening' ? { opening: next.opening, exordio: next.exordio, caseStructure: next.caseStructure } : {}),
    // An older R2 or Conclusor case kept its body in contentions; a new run answers with reinforce or
    // whyWeWin and no arguments, so those come across too rather than the section going empty.
    ...(section === 'contentions'
      ? {
          contentions: next.contentions,
          ...(next.contentions.length === 0 && next.reinforce?.length ? { reinforce: next.reinforce } : {}),
          ...(next.contentions.length === 0 && next.whyWeWin?.length ? { whyWeWin: next.whyWeWin } : {}),
        }
      : {}),
    ...(section === 'counters' ? { counters: next.counters, predictedOpponentCase: next.predictedOpponentCase } : {}),
    ...(section === 'reinforce' ? { reinforce: next.reinforce } : {}),
    ...(section === 'whyWeWin' ? { whyWeWin: next.whyWeWin } : {}),
    ...(section === 'closing' ? { closingLine: next.closingLine } : {}),
    sources: mergeCaseSources(base.sources, next.sources),
    metadata: next.metadata,
  };
}
