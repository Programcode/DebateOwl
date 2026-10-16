import type { ProviderConfig } from '../providers/types';
import { FactoidsOutputSchema, type FactoidsOutput, type FactoidsInput } from '../schemas/factoids';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';

export async function factoids(input: FactoidsInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal): Promise<ResultWithSources<FactoidsOutput>> {
  const inputWithLanguage = withOutputLanguage({
    ...input,
    region: input.region?.trim() || 'Global',
    sourceCount: input.sourceCount || 5,
  });
  const response = await callSupabaseAI<ResultWithSources<FactoidsOutput>>('factoids', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    signal,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const parsed = FactoidsOutputSchema.safeParse(data.output);
      if (!parsed.success) {
        throw new AIResponseError('AI response did not match the expected factoids schema.', {
          details: { issues: parsed.error.issues },
        });
      }

      const allFactoids = parsed.data.factoids;
      const verifiedFactoids = allFactoids.filter((factoid) => factoid.citation.verified === 'verified');
      const returnedFactoids = verifiedFactoids.slice(0, input.sourceCount || 5);
      return {
        result: {
          ...parsed.data,
          factoids: returnedFactoids,
          filteredOutCount: Math.max(0, allFactoids.length - returnedFactoids.length),
        },
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'factoids', workspaceContext ? null : debateId);
  return response;
}
