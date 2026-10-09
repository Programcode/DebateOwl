import {
  AUTO_SAVED_FOLDER,
  autoSavedSourceRow,
  parseDiscoveredSources,
  retainedDiscoveredSources,
  type DiscoveredSource,
  type ResultWithSources,
} from '@debatelab/core/ai/discovered-sources';
import { transformBrainstormResponse } from '@debatelab/core/ai/brainstorm-output';
import { factoidsRequestInput, selectVerifiedFactoids } from '@debatelab/core/ai/factoids-output';
import { expectedContentionCount, transformGenerateResponse } from '@debatelab/core/ai/generate-output';
import { AttackOutputSchema, type AttackInput, type AttackOutput } from '@debatelab/core/ai/schemas/attack';
import { BrainstormOutputSchema, type BrainstormInput, type BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import { FactoidsOutputSchema, type FactoidsInput, type FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import { GenerateOutputSchema, type GenerateInput, type GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import type { SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';
import type { DebateContextRequest } from '@debatelab/core/contract/debate-context';

import { AIError, functionOutput, postFunction, PROVIDER, responseExtras, type ResponseExtras } from './ai-request';
import type { FeatureConfig } from './feature-config';
import { addSource, applySourceAssessments, fetchSourceIdsInFolder, removeSource } from './sources';
import { supabase } from './supabase';

/**
 * Generate, Attack, Brainstorm and Factoids, sent and saved the way the
 * website does it: generateCase, attackCase, brainstorm and factoids in
 * src/lib/ai/client.ts for the requests and their researched sources, and
 * recordResult and saveCurrentCase in src/lib/stores/session-store.ts for the
 * saved rows.
 */

export type ResultKind = 'case' | 'attack' | 'brainstorm' | 'factoids';

const TABLES = { case: 'cases', attack: 'attacks', brainstorm: 'brainstorms', factoids: 'factoids' } as const satisfies Record<ResultKind, string>;

export interface OutputFor {
  case: GenerateOutput;
  attack: AttackOutput;
  brainstorm: BrainstormOutput;
  factoids: FactoidsOutput;
}

/** The feature each kind is sent as, and the name its researched sources are captured under. */
type Feature = 'generate' | 'attack' | 'brainstorm' | 'factoids';

export interface SavedResult<K extends ResultKind> {
  id: string;
  kind: K;
  title: string;
  side: string | null;
  debateId: string | null;
  createdAt: number;
  input: Record<string, unknown>;
  output: OutputFor[K];
}

interface RequestOptions {
  config: FeatureConfig;
  language: string;
  /** Absent for one-off work. */
  debateContext?: DebateContextRequest;
  signal?: AbortSignal;
}

function requestBody(feature: Feature, input: Record<string, unknown>, options: RequestOptions) {
  return {
    feature,
    input: { ...input, language: options.language },
    provider: PROVIDER,
    model: options.config.model,
    temperature: options.config.temperature,
    reasoningEffort: options.config.reasoningEffort,
    // Servers from before Current Debate context read only this field.
    sourceIds: options.debateContext?.sourceIds ?? [],
    ...(options.debateContext ? { debateContext: options.debateContext } : {}),
  };
}

/** A generated case, checked like the website checks it and stamped with the local time and motion. */
export function generateCase(input: GenerateInput, options: RequestOptions): Promise<ResultWithSources<GenerateOutput> & ResponseExtras> {
  return postFunction('ai', requestBody('generate', input, options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const parsed = GenerateOutputSchema.safeParse(transformGenerateResponse(output as Record<string, unknown>));
    if (!parsed.success) throw new AIError('failed', 'AI response did not match the expected generate schema.');
    const result = parsed.data;
    if (result.contentions.length !== expectedContentionCount(input.length)) {
      throw new AIError('failed', 'AI response did not contain the expected number of contentions.');
    }
    result.metadata.generatedAt = new Date().toISOString();
    result.metadata.motion = input.motion;
    return { result, discoveredSources: parseDiscoveredSources(data.discoveredSources), ...responseExtras(data) };
  });
}

export function attackCase(input: AttackInput, options: RequestOptions): Promise<ResultWithSources<AttackOutput> & ResponseExtras> {
  return postFunction('ai', requestBody('attack', input, options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const parsed = AttackOutputSchema.safeParse(output);
    if (!parsed.success) throw new AIError('failed', 'AI response did not match the expected attack schema.');
    return { result: parsed.data, discoveredSources: parseDiscoveredSources(data.discoveredSources), ...responseExtras(data) };
  });
}

export function brainstormIdeas(input: BrainstormInput, options: RequestOptions): Promise<ResultWithSources<BrainstormOutput> & ResponseExtras> {
  return postFunction('ai', requestBody('brainstorm', input, options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const result = readBrainstorm(output);
    if (!result) throw new AIError('failed', 'AI response did not match the expected brainstorm schema.');
    return {
      result,
      discoveredSources: parseDiscoveredSources(data.discoveredSources),
      ...responseExtras(data),
    };
  });
}

/** Factoids, as the website asks for them: verified ones only, up to the number of sources chosen. */
export function findFactoids(input: FactoidsInput, options: RequestOptions): Promise<ResultWithSources<FactoidsOutput> & ResponseExtras> {
  return postFunction('ai', requestBody('factoids', factoidsRequestInput(input), options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const parsed = FactoidsOutputSchema.safeParse(output);
    if (!parsed.success) throw new AIError('failed', 'AI response did not match the expected factoids schema.');
    return {
      result: selectVerifiedFactoids(parsed.data, input.sourceCount),
      discoveredSources: parseDiscoveredSources(data.discoveredSources),
      ...responseExtras(data),
    };
  });
}

/**
 * Keeps the researched sources worth keeping in the debate's Auto-saved
 * folder, one at a time, as the website does. One-off research is not kept.
 * A source that fails to save is skipped; the count of failures is returned.
 * Once the request is cancelled or replaced, no further source is written.
 */
export async function autosaveSources(
  userId: string,
  sources: DiscoveredSource[],
  capturedVia: Feature,
  debateId: string | null,
  signal?: AbortSignal,
): Promise<{ saved: number; failed: number }> {
  if (!debateId) return { saved: 0, failed: 0 };
  let saved = 0;
  let failed = 0;
  for (const source of retainedDiscoveredSources(sources)) {
    if (signal?.aborted) break;
    try {
      await addSource(userId, { ...autoSavedSourceRow(source, capturedVia), debateId });
      saved += 1;
    } catch (cause) {
      console.warn('Could not save a researched source:', cause instanceof Error ? cause.message : cause);
      failed += 1;
    }
  }
  return { saved, failed };
}

/**
 * Saves the rankings of the Library sources a result used, into the debate
 * the request was sent for. One-off work has no Library to rank. Returns
 * false when the rankings could not be saved; the result itself still stands.
 * Once the request is cancelled or replaced, no ranking is written.
 */
export async function keepSourceAssessments(userId: string, debateId: string | null, assessments: SourceAssessmentUpdate[], signal?: AbortSignal): Promise<boolean> {
  if (!debateId || assessments.length === 0) return true;
  try {
    await applySourceAssessments(userId, debateId, assessments, signal);
    return true;
  } catch (cause) {
    console.warn('Could not save the source rankings:', cause instanceof Error ? cause.message : cause);
    return false;
  }
}

/** Problems from making a result, told once when its document opens. */
export type ArrivalNotice = 'recordFailed' | 'sourcesFailed' | 'assessmentsFailed' | 'shortened';

/** The arrival notices as one route parameter, or undefined when there is nothing to tell. */
export function arrivalNotices(outcome: { recordFailed: boolean; sourcesFailed: number; assessed: boolean; truncated: boolean }): string | undefined {
  const notices: ArrivalNotice[] = [];
  if (outcome.recordFailed) notices.push('recordFailed');
  else if (outcome.sourcesFailed > 0) notices.push('sourcesFailed');
  if (!outcome.assessed) notices.push('assessmentsFailed');
  if (outcome.truncated) notices.push('shortened');
  return notices.length > 0 ? notices.join(',') : undefined;
}

/** The website's rule for its undo: every source in the debate's Auto-saved folder. */
export function fetchAutoSavedSourceIds(userId: string, debateId: string): Promise<string[]> {
  return fetchSourceIdsInFolder(userId, debateId, AUTO_SAVED_FOLDER);
}

/** Removes the debate's auto-saved sources; a source moved to another debate since is left alone. */
export async function removeSources(userId: string, debateId: string, ids: string[]): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(ids.map((id) => removeSource(userId, id, debateId)));
  const succeeded = results.filter((result) => result.status === 'fulfilled').length;
  return { succeeded, failed: results.length - succeeded };
}

/**
 * Every read and write below also filters on the user. Row level security is
 * the real boundary; the filter keeps a wrong session from mixing accounts.
 */

/** Saves a result into its debate, as the website's recordResult. Returns the new row's id. */
export async function recordResult<K extends ResultKind>(
  userId: string,
  kind: K,
  record: { title: string; input: unknown; output: OutputFor[K]; debateId: string; side: string },
): Promise<string> {
  const { data, error } = await supabase
    .from(TABLES[kind])
    .insert({
      user_id: userId,
      debate_id: record.debateId,
      side: record.side,
      title: record.title.slice(0, 300) || 'Untitled',
      input: record.input ?? {},
      output: record.output,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? `Could not save the ${kind}`);
  return (data as { id: string }).id;
}

/** Saves a case outside any debate, as the website's Save button does for unrecorded work. */
export async function saveCase(userId: string, title: string, output: GenerateOutput): Promise<string> {
  const { data, error } = await supabase
    .from('cases')
    .insert({ user_id: userId, title, input: {}, output })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the case');
  return (data as { id: string }).id;
}

interface ResultRow {
  id: string;
  title: string;
  side: string | null;
  debate_id: string | null;
  created_at: string;
  input: unknown;
  output: unknown;
}

export async function fetchResult<K extends ResultKind>(userId: string, kind: K, id: string): Promise<SavedResult<K> | null> {
  const { data, error } = await supabase
    .from(TABLES[kind])
    .select('id,title,side,debate_id,created_at,input,output')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as ResultRow;
  return {
    id: row.id,
    kind,
    title: row.title,
    side: row.side,
    debateId: row.debate_id,
    createdAt: new Date(row.created_at).getTime(),
    input: row.input && typeof row.input === 'object' && !Array.isArray(row.input) ? (row.input as Record<string, unknown>) : {},
    output: row.output as OutputFor[K],
  };
}

export async function deleteResult(userId: string, kind: ResultKind, id: string): Promise<void> {
  const { error } = await supabase.from(TABLES[kind]).delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The guard the website's results pages use: an old or broken row shows a notice instead of a crash. */
export function isCompleteCase(output: unknown): output is GenerateOutput {
  const value = output as Partial<GenerateOutput> | null;
  return Boolean(value?.caseStructure && Array.isArray(value.contentions) && value.predictedOpponentCase && Array.isArray(value.counters));
}

export function isCompleteAttack(output: unknown): output is AttackOutput {
  const value = output as Partial<AttackOutput> | null;
  return Boolean(value?.overallAssessment && Array.isArray(value.weaknesses));
}

/**
 * A brainstorm, from the model or a saved row, normalized by the website's transform and then
 * checked against its schema; null when it still does not fit. A brainstorm with no ideas is
 * still complete: the website shows "No ideas returned" or its questions.
 */
export function readBrainstorm(output: unknown): BrainstormOutput | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const parsed = BrainstormOutputSchema.safeParse(transformBrainstormResponse(output as Record<string, unknown>));
  return parsed.success ? parsed.data : null;
}

/** A saved factoids row, checked against the schema its request was checked with; null when it does not fit. */
export function readFactoids(output: unknown): FactoidsOutput | null {
  const parsed = FactoidsOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}
