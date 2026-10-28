import type { ProviderConfig } from '../providers/types';
import type { BrainstormOutput, BrainstormInput } from '../schemas/brainstorm';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { callSupabaseAI, withOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';
import { transformBrainstormResponse } from '@debatelab/core/ai/brainstorm-output';

export async function brainstorm(input: BrainstormInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal, live?: LiveGeneration): Promise<ResultWithSources<BrainstormOutput>> {
  const response = await callSupabaseAI<ResultWithSources<BrainstormOutput>>('brainstorm', withOutputLanguage(input as unknown as Record<string, unknown>), config, {
    workspaceContext,
    debateId,
    signal,
    live,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      return {
        result: transformBrainstormResponse(data.output as Record<string, unknown>),
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'brainstorm', workspaceContext ? null : debateId);
  return response;
}
