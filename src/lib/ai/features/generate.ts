import type { ProviderConfig } from '../providers/types';
import { GenerateOutputSchema, type GenerateInput, type GenerateOutput } from '../schemas/generate';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';
import { transformGenerateResponse, expectedContentionCount } from '@debatelab/core/ai/generate-output';

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
