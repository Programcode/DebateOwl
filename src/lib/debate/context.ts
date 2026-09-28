import {
  boundOutputDigests,
  type DebateContextFeature,
  type DebateContextOutputKind,
  type DebateContextRequest,
  type DebateContextSide,
  type DebateOutputRef,
  digestOutput,
  MAX_CONTEXT_OUTPUTS,
  MAX_CONTEXT_SOURCES,
  selectDefaultOutputs,
} from '../../../supabase/functions/_shared/debate-context';
import { boundPromptSources } from '../../../supabase/functions/_shared/source-bounds';
import type { SavedItem, Source } from '@/lib/stores/session-store';
import type { SparringSession } from '@/lib/stores/sparring-store';
import { outputKey, type DebateContextOverride } from '@/lib/stores/debate-context-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What each feature may use, mirroring the server's per-feature policy. */
export interface DebateContextPolicy {
  sources: boolean;
  outputs: boolean;
  instructions: boolean;
}

export function debateContextPolicy(feature: DebateContextFeature, options: { includeSources?: boolean } = {}): DebateContextPolicy {
  // A live sparring round stays transcript-only.
  if (feature === 'sparring') return { sources: false, outputs: false, instructions: true };
  // Crossfire keeps its non-overridable transcript rules.
  if (feature === 'crossfire') return { sources: options.includeSources !== false, outputs: true, instructions: false };
  return { sources: options.includeSources !== false, outputs: true, instructions: true };
}

export interface ContextSourceItem {
  id: string;
  title: string;
  active: boolean;
  included: boolean;
  /** Included but past the per-request source limit, so not sent. */
  overLimit: boolean;
  /** Sent but dropped or shortened to fit the prompt budget. */
  omittedForSize: boolean;
  shortened: boolean;
}

export interface ContextOutputItem {
  ref: DebateOutputRef;
  title: string;
  side: DebateContextSide | null;
  createdAt: number;
  pinned: boolean;
  included: boolean;
  overLimit: boolean;
  omittedForSize: boolean;
  /** Nothing usable yet, such as an unjudged sparring round. */
  empty: boolean;
}

export interface DebateContextPlan {
  debateId: string;
  feature: DebateContextFeature;
  side: DebateContextSide;
  policy: DebateContextPolicy;
  sources: ContextSourceItem[];
  outputs: ContextOutputItem[];
  /** Every result in this debate, the open Ask chat included; pins on anything else no longer count. */
  resultKeys: ReadonlySet<string>;
  request: DebateContextRequest;
}

export interface DebateContextInputs {
  sourceLibrary: Source[];
  results: Partial<Record<Exclude<DebateContextOutputKind, 'sparring'>, SavedItem<unknown>[]>>;
  sparringSessions: SparringSession[];
  pins: DebateOutputRef[];
  override?: DebateContextOverride;
  /** The chat currently open in Ask is already the conversation itself. */
  excludeChatId?: string | null;
}

function sideOf(value: unknown): DebateContextSide | null {
  return value === 'pro' || value === 'con' || value === 'both' || value === 'neutral' ? value : null;
}

interface OutputCandidate {
  ref: DebateOutputRef;
  title: string;
  side: DebateContextSide | null;
  createdAt: number;
  data: unknown;
}

function outputCandidates(debateId: string, inputs: DebateContextInputs): OutputCandidate[] {
  const candidates: OutputCandidate[] = [];
  for (const [kind, items] of Object.entries(inputs.results) as Array<[DebateContextOutputKind, SavedItem<unknown>[] | undefined]>) {
    for (const item of items ?? []) {
      if (item.debateId !== debateId || !UUID.test(item.id)) continue;
      if (kind === 'chat' && item.id === inputs.excludeChatId) continue;
      candidates.push({ ref: { kind, id: item.id }, title: item.title, side: sideOf(item.side), createdAt: item.createdAt, data: item.data });
    }
  }
  for (const session of inputs.sparringSessions) {
    if (session.debateId !== debateId || !UUID.test(session.id)) continue;
    candidates.push({
      ref: { kind: 'sparring', id: session.id },
      title: session.motion,
      side: sideOf(session.userSide),
      createdAt: session.updatedAt,
      data: { userSide: session.userSide, scorecard: session.scorecard },
    });
  }
  return candidates.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The Current Debate material the next request in `feature` will send, with
 * the student's Review choices applied. The server re-checks every ID and
 * applies the same budgets, and its response reports what actually reached
 * the model.
 */
export function planDebateContext(
  feature: DebateContextFeature,
  side: DebateContextSide,
  debateId: string,
  inputs: DebateContextInputs,
  options: { includeSources?: boolean } = {},
): DebateContextPlan {
  const policy = debateContextPolicy(feature, options);
  const override = inputs.override?.debateId === debateId ? inputs.override : undefined;

  const debateSources = policy.sources
    ? inputs.sourceLibrary.filter((source) => source.debateId === debateId && UUID.test(source.id))
    : [];
  const includedSources = debateSources.filter((source) => override?.sources[source.id] ?? source.isActive);
  const sentSources = includedSources.slice(0, MAX_CONTEXT_SOURCES);
  const boundedSources = boundPromptSources(sentSources);
  const sourceState = new Map(sentSources.map((source, index) => {
    const kept = boundedSources[index];
    return [source.id, { omittedForSize: !kept, shortened: Boolean(kept && kept.content.length < source.content.length) }];
  }));
  const sources: ContextSourceItem[] = debateSources.map((source) => {
    const included = includedSources.includes(source);
    const state = sourceState.get(source.id);
    return {
      id: source.id,
      title: source.title,
      active: source.isActive,
      included,
      overLimit: included && !state,
      omittedForSize: state?.omittedForSize ?? false,
      shortened: state?.shortened ?? false,
    };
  });

  const pinnedKeys = new Set(inputs.pins.map(outputKey));
  const candidates = policy.outputs ? outputCandidates(debateId, inputs) : [];
  // A pin on a deleted result is never shown, so it must not use up the limit.
  const resultKeys = new Set(outputCandidates(debateId, { ...inputs, excludeChatId: null }).map((item) => outputKey(item.ref)));
  const defaults = selectDefaultOutputs(
    candidates.map((item) => ({ ...item.ref, side: item.side, createdAt: item.createdAt, pinned: pinnedKeys.has(outputKey(item.ref)) })),
    feature,
    side,
  );
  const defaultKeys = new Set(defaults.map(outputKey));
  const isIncluded = (item: OutputCandidate) => override?.outputs[outputKey(item.ref)] ?? defaultKeys.has(outputKey(item.ref));
  // Defaults keep their order (pins first); extra choices follow, newest first.
  const byKey = new Map(candidates.map((item) => [outputKey(item.ref), item]));
  const ordered = [
    ...defaults.map((ref) => byKey.get(outputKey(ref))!).filter(isIncluded),
    ...candidates.filter((item) => !defaultKeys.has(outputKey(item.ref)) && isIncluded(item)),
  ];
  const sentOutputs = ordered.slice(0, MAX_CONTEXT_OUTPUTS);
  const bounded = boundOutputDigests(sentOutputs.map((item) => ({ key: outputKey(item.ref), digest: digestOutput(item.ref.kind, item.data) })));
  const tooLarge = new Set(bounded.omittedForSize.map((item) => item.key));
  const empty = new Set(bounded.empty.map((item) => item.key));
  const sentKeys = new Set(sentOutputs.map((item) => outputKey(item.ref)));
  const outputs: ContextOutputItem[] = candidates.map((item) => {
    const key = outputKey(item.ref);
    const included = isIncluded(item);
    return {
      ref: item.ref,
      title: item.title,
      side: item.side,
      createdAt: item.createdAt,
      pinned: pinnedKeys.has(key),
      included,
      overLimit: included && !sentKeys.has(key),
      omittedForSize: tooLarge.has(key),
      empty: empty.has(key),
    };
  });

  return {
    debateId,
    feature,
    side,
    policy,
    sources,
    outputs,
    resultKeys,
    request: {
      debateId,
      side,
      sourceIds: sentSources.map((source) => source.id),
      outputs: sentOutputs.filter((item) => !empty.has(outputKey(item.ref))).map((item) => item.ref),
    },
  };
}
