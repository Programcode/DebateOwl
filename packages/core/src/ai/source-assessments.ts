import type { SourceSemanticMetadata } from './discovered-sources';

/** The ai function's ranking of a Library source a result used, from `data.sourceAssessments`. */
export interface SourceAssessmentUpdate {
  key: string;
  id?: string;
  relevance: number;
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  evaluatedAt: string;
  retained: boolean;
  usedInCase?: boolean;
}

/** At most ten well-formed assessments; anything malformed is dropped. */
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

/** Whether an assessment is about this source: by id, or by the key the server gave it. */
export function isAssessedSource(source: { id: string; origin?: string | null; metadata?: { url?: string } | null }, assessment: SourceAssessmentUpdate): boolean {
  return source.id === assessment.id || source.id === assessment.key || source.origin === assessment.key || source.metadata?.url === assessment.key;
}

/** The source's semantic metadata after one more use, ranked by this assessment. */
export function assessedSemantic(prior: SourceSemanticMetadata | undefined, assessment: SourceAssessmentUpdate): SourceSemanticMetadata {
  const usedInCase = assessment.usedInCase;
  return {
    relevance: assessment.relevance,
    importance: assessment.importance,
    strength: assessment.strength,
    evaluatedAt: assessment.evaluatedAt,
    useCount: (prior?.useCount ?? 0) + 1,
    caseUseCount: (prior?.caseUseCount ?? 0) + (usedInCase === true ? 1 : 0),
    lastUsedAt: assessment.evaluatedAt,
    ...(usedInCase !== undefined
      ? { lastUsedInCase: usedInCase }
      : prior?.lastUsedInCase !== undefined ? { lastUsedInCase: prior.lastUsedInCase } : {}),
  };
}
