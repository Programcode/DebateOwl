import {
  DuplicateSourceError,
  useSessionStore,
  type SourceAssessmentUpdate,
  type SourceProvenance,
  type SourceSemanticMetadata,
} from '../stores/session-store';
import { activeDebateId } from '../stores/debate-store';
import { toast } from '@/hooks/use-toast';
import { validateUrl } from '@/lib/validation/url';
import { findSavedPage, normalizeSourceUrl } from '@/lib/source-url';
import i18n from '@/i18n';

/** A web source discovered during research, with auditable ranking metadata from the edge function. */
export interface DiscoveredSource extends Omit<SourceProvenance, 'url'> {
  title: string;
  url: string;
  content?: string;
}

/** Feature result plus the researched sources that informed it. */
export interface ResultWithSources<T> {
  result: T;
  discoveredSources: DiscoveredSource[];
}

function parseSourceSemanticMetadata(value: unknown): SourceSemanticMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const semantic = value as Record<string, unknown>;
  const { relevance, importance, strength, evaluatedAt, useCount, caseUseCount } = semantic;
  if (typeof relevance !== 'number' || !Number.isFinite(relevance) || relevance < 0 || relevance > 1 ||
    typeof importance !== 'number' || !Number.isInteger(importance) || importance < 0 || importance > 3 ||
    typeof strength !== 'number' || !Number.isInteger(strength) || strength < 0 || strength > 3 ||
    typeof evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evaluatedAt)) ||
    typeof useCount !== 'number' || !Number.isInteger(useCount) || useCount < 0 ||
    typeof caseUseCount !== 'number' || !Number.isInteger(caseUseCount) || caseUseCount < 0 ||
    (semantic.lastUsedAt !== undefined && typeof semantic.lastUsedAt !== 'string') ||
    (semantic.lastUsedInCase !== undefined && typeof semantic.lastUsedInCase !== 'boolean')) return undefined;
  return {
    relevance,
    importance: importance as 0 | 1 | 2 | 3,
    strength: strength as 0 | 1 | 2 | 3,
    evaluatedAt,
    useCount,
    caseUseCount,
    ...(typeof semantic.lastUsedAt === 'string' ? { lastUsedAt: semantic.lastUsedAt } : {}),
    ...(typeof semantic.lastUsedInCase === 'boolean' ? { lastUsedInCase: semantic.lastUsedInCase } : {}),
  };
}

/**
 * Parses the discovered-sources payload at the trust boundary: only
 * well-formed entries with a title and URL survive; anything else is dropped.
 */
export function parseDiscoveredSources(value: unknown): DiscoveredSource[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): DiscoveredSource[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

    const candidate: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(item)) candidate[key] = fieldValue;

    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    const normalizedUrl = validateUrl(url);
    if (!title || !normalizedUrl) return [];

    const source: DiscoveredSource = { title, url: normalizedUrl };
    if (typeof candidate.content === 'string') source.content = candidate.content;

    if (typeof candidate.sourceType === 'string' && candidate.sourceType.trim()) {
      source.sourceType = candidate.sourceType.trim();
    }

    if (typeof candidate.qualityScore === 'number' && Number.isFinite(candidate.qualityScore) &&
      candidate.qualityScore >= 0 && candidate.qualityScore <= 100) {
      source.qualityScore = candidate.qualityScore;
    }

    if (candidate.qualityLabel === 'strong' || candidate.qualityLabel === 'moderate' || candidate.qualityLabel === 'weak') {
      source.qualityLabel = candidate.qualityLabel;
    }

    if (typeof candidate.query === 'string' && candidate.query.trim()) {
      source.query = candidate.query.trim();
    }

    const semantic = parseSourceSemanticMetadata(candidate.semantic);
    if (semantic) source.semantic = semantic;

    return [source];
  });
}

export function parseSourceAssessments(value: unknown): SourceAssessmentUpdate[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item): SourceAssessmentUpdate[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    const { relevance, importance, strength, evaluatedAt } = candidate;
    if (!key || typeof relevance !== 'number' || !Number.isFinite(relevance) || relevance < 0 || relevance > 1 ||
      typeof importance !== 'number' || !Number.isInteger(importance) || importance < 0 || importance > 3 ||
      typeof strength !== 'number' || !Number.isInteger(strength) || strength < 0 || strength > 3 ||
      typeof evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evaluatedAt)) || typeof candidate.retained !== 'boolean') return [];
    return [{
      key,
      ...(typeof candidate.id === 'string' && candidate.id.trim() ? { id: candidate.id.trim() } : {}),
      relevance,
      importance: importance as 0 | 1 | 2 | 3,
      strength: strength as 0 | 1 | 2 | 3,
      evaluatedAt,
      retained: candidate.retained,
      ...(typeof candidate.usedInCase === 'boolean' ? { usedInCase: candidate.usedInCase } : {}),
    }];
  });
}

type AutosaveFeature = 'generate' | 'attack' | 'brainstorm' | 'factoids';

export { normalizeSourceUrl };

// Generate, Attack, Brainstorm and Factoids can finish at the same time. Each
// batch waits for the one before it, so it sees the rows that batch saved.
let autosaveQueue: Promise<void> = Promise.resolve();

export function autosaveDiscoveredSources(sources: DiscoveredSource[], capturedVia: AutosaveFeature, debateId: string | null | undefined): Promise<void> {
  const targetDebateId = debateId !== undefined ? debateId : activeDebateId();
  const run = autosaveQueue.then(() => autosaveBatch(sources, capturedVia, targetDebateId));
  autosaveQueue = run.catch((): void => undefined);
  return run;
}

async function autosaveBatch(sources: DiscoveredSource[], capturedVia: AutosaveFeature, targetDebateId: string | null): Promise<void> {
  // Every source belongs to one debate, so one-off research is not kept.
  if (!targetDebateId) return;
  const seen = new Set<string>();
  const retainedSources = sources.filter((source) => {
    const keep = !source.semantic ||
      (source.qualityLabel !== 'weak' && source.semantic.relevance >= 0.45) ||
      source.semantic.lastUsedInCase === true;
    if (!keep) return false;
    // The same page twice in one answer is saved once.
    const key = normalizeSourceUrl(source.url) ?? source.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (retainedSources.length === 0) return;

  let added = 0;
  for (const source of retainedSources) {
    const session = useSessionStore.getState();
    const metadata = {
      url: source.url,
      ...(source.sourceType !== undefined ? { sourceType: source.sourceType } : {}),
      ...(source.qualityScore !== undefined ? { qualityScore: source.qualityScore } : {}),
      ...(source.qualityLabel !== undefined ? { qualityLabel: source.qualityLabel } : {}),
      ...(source.query !== undefined ? { query: source.query } : {}),
      ...(source.semantic !== undefined ? { semantic: source.semantic } : {}),
      capturedVia,
    };
    const existing = findSavedPage(session.sourceLibrary, targetDebateId, source.url);
    try {
      if (existing) {
        // Already in this debate's Library: refresh what research learned about
        // it, and keep the student's title, folder and on/off choice.
        await session.updateSource(existing.id, {
          metadata: { ...existing.metadata, ...metadata },
          ...(!existing.content.trim() && source.content ? { content: source.content } : {}),
        });
        continue;
      }
      await session.addSource({
        title: source.title,
        content: source.content ?? '',
        type: 'url',
        origin: source.url,
        folder: 'Auto-saved',
        debateId: targetDebateId,
        isActive: source.qualityLabel === 'strong' || source.qualityLabel === 'moderate',
        metadata,
      });
      added += 1;
    } catch (error) {
      // Another tab saved this page first; the debate already has it.
      if (error instanceof DuplicateSourceError) continue;
      toast({
        title: i18n.t('aiClient.sourceSaveFailed'),
        description: i18n.t('aiClient.sourceSaveFailedDesc', { title: source.title }),
        variant: 'destructive',
      });
    }
  }
  // Research changes what grounds the next request, so say so.
  if (added > 0) {
    toast({
      title: i18n.t('aiClient.sourcesAutoSaved', { count: added }),
      description: i18n.t('aiClient.sourcesAutoSavedDesc'),
    });
  }
}
