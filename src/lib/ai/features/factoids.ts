import { factoidsRequestInput, selectVerifiedFactoids } from '@debatelab/core/ai/factoids-output';
import type { ProviderConfig } from '../providers/types';
import { FactoidsOutputSchema, type FactoidsOutput, type FactoidsInput } from '../schemas/factoids';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';

export async function factoids(input: FactoidsInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal, live?: LiveGeneration): Promise<ResultWithSources<FactoidsOutput>> {
  const inputWithLanguage = withOutputLanguage({ ...factoidsRequestInput(input) });
  const response = await callSupabaseAI<ResultWithSources<FactoidsOutput>>('factoids', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    signal,
    live,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const parsed = FactoidsOutputSchema.safeParse(data.output);
      if (!parsed.success) {
        throw new AIResponseError('AI response did not match the expected factoids schema.', {
          details: { issues: parsed.error.issues },
        });
      }

      return {
        result: selectVerifiedFactoids(parsed.data, input.sourceCount),
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'factoids', workspaceContext ? null : debateId);
  return response;
}
