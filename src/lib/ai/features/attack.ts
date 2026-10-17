import type { ProviderConfig } from '../providers/types';
import { AttackOutputSchema, type AttackOutput, type AttackInput } from '../schemas/attack';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';
import { autosaveDiscoveredSources, parseDiscoveredSources, type ResultWithSources } from '../sources';

/**
 * Validates the attack response at the trust boundary. Attack outputs were
 * previously cast without validation; now malformed provider responses fail
 * loudly instead of rendering unverified shapes.
 */
function validateAttackOutput(output: unknown): AttackOutput {
  const parsed = AttackOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected attack schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

export async function attackCase(input: AttackInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null, signal?: AbortSignal, live?: LiveGeneration): Promise<ResultWithSources<AttackOutput>> {
  const response = await callSupabaseAI<ResultWithSources<AttackOutput>>('attack', withOutputLanguage(input as unknown as Record<string, unknown>), config, {
    workspaceContext,
    debateId,
    signal,
    live,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      return {
        result: validateAttackOutput(data.output),
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'attack', workspaceContext ? null : debateId);
  return response;
}
