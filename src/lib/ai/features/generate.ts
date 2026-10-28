import type { ProviderConfig } from '../providers/types';
import { GenerateOutputSchema, type GenerateInput, type GenerateOutput } from '../schemas/generate';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';
import { cleanGeneratedOutput } from '../text';

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
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

export async function generateCase(input: GenerateInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal, live?: LiveGeneration): Promise<ResultWithSources<GenerateOutput>> {
  const inputWithLanguage = withOutputLanguage(input as unknown as Record<string, unknown>);
  const response = await callSupabaseAI<ResultWithSources<GenerateOutput>>('generate', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    signal,
    live,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const result = validateGenerateOutput(transformGenerateResponse(data.output as Record<string, unknown>));
      const expectedCount = expectedContentionCount(input.length);
      // R2 backs up the team's arguments and a Conclusor sums up why we win,
      // so neither brings new arguments. An older backend still sends both
      // the usual argument count.
      const noNewArguments = (input.role === 'r2' && Boolean(result.reinforce?.length))
        || (input.role === 'conc' && Boolean(result.whyWeWin?.length));
      if (!noNewArguments && result.contentions.length !== expectedCount) {
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
