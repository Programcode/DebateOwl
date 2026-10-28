import { normalizeSourceUrl } from '../source-url';
import { validateUrl } from '../validation/url';

export interface SourceSemanticMetadata {
  relevance: number;
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  evaluatedAt: string;
  useCount: number;
  caseUseCount: number;
  lastUsedAt?: string;
  lastUsedInCase?: boolean;
}

/** A web source discovered during research, with auditable ranking metadata from the edge function. */
export interface DiscoveredSource {
  title: string;
  url: string;
  content?: string;
  sourceType?: string;
  qualityScore?: number;
  qualityLabel?: 'strong' | 'moderate' | 'weak';
  query?: string;
  capturedVia?: string;
  semantic?: SourceSemanticMetadata;
}

/** Feature result plus the researched sources that informed it. */
export interface ResultWithSources<T> {
  result: T;
  discoveredSources: DiscoveredSource[];
}

export function parseSourceSemanticMetadata(value: unknown): SourceSemanticMetadata | undefined {
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

/** The Library folder researched sources are saved to. */
export const AUTO_SAVED_FOLDER = 'Auto-saved';

/** The researched sources worth keeping in the Library: weak or off-topic ones are dropped unless the case used them. */
export function retainedDiscoveredSources(sources: DiscoveredSource[]): DiscoveredSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const keep = !source.semantic ||
      (source.qualityLabel !== 'weak' && source.semantic.relevance >= 0.45) ||
      source.semantic.lastUsedInCase === true;
    if (!keep) return false;
    const key = normalizeSourceUrl(source.url) ?? source.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The Library row an auto-saved source becomes, apart from its user and debate. */
export function autoSavedSourceRow(source: DiscoveredSource, capturedVia: string) {
  return {
    title: source.title,
    content: source.content ?? '',
    type: 'url' as const,
    origin: source.url,
    folder: AUTO_SAVED_FOLDER,
    isActive: source.qualityLabel === 'strong' || source.qualityLabel === 'moderate',
    metadata: {
      url: source.url,
      ...(source.sourceType !== undefined ? { sourceType: source.sourceType } : {}),
      ...(source.qualityScore !== undefined ? { qualityScore: source.qualityScore } : {}),
      ...(source.qualityLabel !== undefined ? { qualityLabel: source.qualityLabel } : {}),
      ...(source.query !== undefined ? { query: source.query } : {}),
      ...(source.semantic !== undefined ? { semantic: source.semantic } : {}),
      capturedVia,
    },
  };
}
