import type { ProviderConfig } from '../providers/types';
import { GenerateOutputSchema, type GenerateInput, type GenerateOutput } from '../schemas/generate';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';
import { cleanGeneratedOutput } from '../text';

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
  // If already in correct format, return as-is (with exordio preserved)
  if (response.caseStructure && response.contentions && response.predictedOpponentCase && response.counters && response.metadata) {
    // Ensure exordio is properly structured if present
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

  // Transform rebuttals to counters
  const rebuttals = (response.rebuttals as Array<{ attack?: string; response?: string }>) || [];
  const counters = rebuttals.map(r => ({
    targetArgument: r.attack || '',
    counterpoint: r.response || '',
    rebuttal: r.response || '',
  }));

  // Transform potentialWeaknesses to predictedOpponentCase
  const weaknesses = (response.potentialWeaknesses as string[]) || [];

  const result: GenerateOutput = {
    caseStructure: {
      thesis: (response.thesis as string) || (response.title as string) || '',
      framework: 'General framework',
      keyDefinitions: [],
      burdenOfProof: 'We must prove that ' + ((response.thesis as string) || '').slice(0, 50),
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
    predictedOpponentCase: {
      likelyArguments: weaknesses.slice(0, 3),
      strategicWeaknesses: weaknesses,
      keyClashes: ['Main clash point'],
    },
    counters: counters.length > 0 ? counters : [{
      targetArgument: 'Opponent argument',
      counterpoint: 'Our counter',
      rebuttal: 'Rebuttal text',
    }],
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

/** Validates the transformed generate response before it can be rendered or persisted alongside sources. */
function validateGenerateOutput(output: unknown): GenerateOutput {
  const parsed = GenerateOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected generate schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

function expectedContentionCount(length: GenerateInput['length']): number {
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

export async function generateCase(input: GenerateInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal): Promise<ResultWithSources<GenerateOutput>> {
  const inputWithLanguage = withOutputLanguage(input as unknown as Record<string, unknown>);
  const response = await callSupabaseAI<ResultWithSources<GenerateOutput>>('generate', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    signal,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const result = validateGenerateOutput(transformGenerateResponse(data.output as Record<string, unknown>));
      const expectedCount = expectedContentionCount(input.length);
      if (result.contentions.length !== expectedCount) {
        throw new AIResponseError('AI response did not contain the expected number of contentions.', {
          details: { expectedCount, actualCount: result.contentions.length },
        });
      }
      return { result, discoveredSources: parseDiscoveredSources(data.discoveredSources) };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'generate', workspaceContext ? null : debateId);
  return response;
}
