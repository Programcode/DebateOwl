import {
  callJev,
  type CallJevArgs,
  type JevDecisionResult,
  type JevNoulAnswer,
  type JevScoreAnswer,
} from "./jev.ts";

const MAX_SOURCES = 10;
const MAX_REQUEST_CHARS = 8_000;
const MAX_SOURCE_CHARS = 1_500;
const SCORE_CONFIDENCE = 0.55;
const RETAIN_RELEVANCE = 0.45;
const SCORE_CRITERIA = ["None", "Low", "Medium", "High"] as const;

export interface SourceDecisionCandidate {
  key: string;
  id?: string;
  title: string;
  content: string;
  origin?: string;
  type: string;
  qualityScore?: number;
  qualityLabel?: "strong" | "moderate" | "weak";
}

export interface SourceAssessment {
  key: string;
  id?: string;
  relevance: number;
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  evaluatedAt: string;
  retained: boolean;
}

export interface CaseSourceUsage {
  key: string;
  id?: string;
  title: string;
  origin?: string;
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  probability: number;
  judgment: "used" | "uncertain" | "not_used";
}

export type SourceDecisionJev = (args: CallJevArgs) => Promise<JevDecisionResult>;

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || error instanceof DOMException && error.name === "AbortError";
}

function scoreAnswer(value: unknown): JevScoreAnswer | null {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "score") return null;
  const answer = value as JevScoreAnswer;
  return Number.isInteger(answer.score) && answer.score >= 0 && answer.score <= 3 &&
      Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1
    ? answer
    : null;
}

function noulAnswer(value: unknown): JevNoulAnswer | null {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "noul") return null;
  const answer = value as JevNoulAnswer;
  return Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1 ? answer : null;
}

function boundedSources(sources: readonly SourceDecisionCandidate[]) {
  return sources.slice(0, MAX_SOURCES).map((source, index) => ({
    index,
    key: source.key.slice(0, 500),
    title: source.title.slice(0, 300),
    excerpt: source.content.slice(0, MAX_SOURCE_CHARS),
    type: source.type.slice(0, 64),
    ...(source.origin ? { origin: source.origin.slice(0, 500) } : {}),
    ...(source.qualityLabel ? { qualityLabel: source.qualityLabel } : {}),
    ...(source.qualityScore !== undefined ? { qualityScore: source.qualityScore } : {}),
  }));
}

export async function rankSourcesForRequest({
  feature,
  requestText,
  sources,
  signal,
  callJevImpl = callJev,
}: {
  feature: string;
  requestText: string;
  sources: SourceDecisionCandidate[];
  signal?: AbortSignal;
  callJevImpl?: SourceDecisionJev;
}): Promise<{ sources: SourceDecisionCandidate[]; assessments: SourceAssessment[]; jev?: JevDecisionResult }> {
  const candidates = boundedSources(sources);
  if (candidates.length === 0) return { sources, assessments: [] };
  const questions: CallJevArgs["questions"] = {};
  candidates.forEach((_, index) => {
    questions[`source_${index}_relevance`] = {
      type: "noul",
      instructions: "Is this source relevant to the user's requested output?",
      criteria: { true: "Materially relevant", false: "Not materially relevant" },
    };
    questions[`source_${index}_importance`] = {
      type: "score",
      instructions: "How important is this source to producing the requested output?",
      criteria: SCORE_CRITERIA,
    };
    questions[`source_${index}_strength`] = {
      type: "score",
      instructions: "How strong is the source as evidence for the requested output?",
      criteria: SCORE_CRITERIA,
    };
  });

  try {
    const jev = await callJevImpl({
      state: { feature: feature.slice(0, 64), request: requestText.slice(0, MAX_REQUEST_CHARS), sources: candidates },
      questions,
      signal,
    });
    const evaluatedAt = new Date().toISOString();
    const assessments = candidates.map((candidate, index): SourceAssessment | null => {
      const relevance = noulAnswer(jev.answers[`source_${index}_relevance`]);
      const importance = scoreAnswer(jev.answers[`source_${index}_importance`]);
      const strength = scoreAnswer(jev.answers[`source_${index}_strength`]);
      if (!relevance || !importance || !strength) return null;
      return {
        key: candidate.key,
        ...(sources[index].id ? { id: sources[index].id } : {}),
        relevance: relevance.noul,
        importance: importance.score as 0 | 1 | 2 | 3,
        strength: strength.score as 0 | 1 | 2 | 3,
        evaluatedAt,
        retained: sources[index].qualityLabel !== "weak" && relevance.noul >= RETAIN_RELEVANCE,
      };
    });
    if (assessments.some((assessment) => assessment === null)) return { sources, assessments: [] };
    const valid = assessments as SourceAssessment[];
    const hasConfidentAssessment = candidates.some((_, index) => {
      const importance = scoreAnswer(jev.answers[`source_${index}_importance`]);
      const strength = scoreAnswer(jev.answers[`source_${index}_strength`]);
      return Boolean(importance && strength && importance.confidence >= SCORE_CONFIDENCE && strength.confidence >= SCORE_CONFIDENCE);
    });
    if (!hasConfidentAssessment) return { sources, assessments: valid, jev };

    const assessmentByKey = new Map(valid.map((assessment) => [assessment.key, assessment]));
    const ranked = sources.map((source, index) => ({ source, index })).sort((a, b) => {
      const weakDifference = Number(a.source.qualityLabel === "weak") - Number(b.source.qualityLabel === "weak");
      if (weakDifference !== 0) return weakDifference;
      const left = assessmentByKey.get(a.source.key);
      const right = assessmentByKey.get(b.source.key);
      if (!left || !right) return a.index - b.index;
      return right.relevance - left.relevance ||
        right.importance - left.importance ||
        right.strength - left.strength ||
        (b.source.qualityScore ?? 0) - (a.source.qualityScore ?? 0) ||
        a.index - b.index;
    }).map(({ source }) => source);
    return { sources: ranked, assessments: valid, jev };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return { sources, assessments: [] };
  }
}

export async function identifyCaseSourceUsage({
  caseText,
  sources,
  signal,
  callJevImpl = callJev,
}: {
  caseText: string;
  sources: Array<SourceDecisionCandidate & Partial<Pick<SourceAssessment, "importance" | "strength">>>;
  signal?: AbortSignal;
  callJevImpl?: SourceDecisionJev;
}): Promise<{ sourceUsage: CaseSourceUsage[]; jev?: JevDecisionResult }> {
  const candidates = boundedSources(sources);
  if (candidates.length === 0) return { sourceUsage: [] };
  const questions: CallJevArgs["questions"] = {};
  candidates.forEach((_, index) => {
    questions[`source_${index}_used`] = {
      type: "noul",
      instructions: "Did this source materially inform a claim, warrant, evidence statement, or impact in the generated case?",
      criteria: { true: "Materially used", false: "Not materially used" },
    };
  });
  try {
    const jev = await callJevImpl({ state: { case: caseText.slice(0, 16_000), sources: candidates }, questions, signal });
    const sourceUsage = candidates.flatMap((candidate, index): CaseSourceUsage[] => {
      const answer = noulAnswer(jev.answers[`source_${index}_used`]);
      if (!answer) return [];
      const source = sources[index];
      return [{
        key: source.key,
        ...(source.id ? { id: source.id } : {}),
        title: source.title.slice(0, 300),
        ...(source.origin ? { origin: source.origin.slice(0, 500) } : {}),
        importance: source.importance ?? 0,
        strength: source.strength ?? 0,
        probability: answer.noul,
        judgment: answer.noul > 0.70 ? "used" : answer.noul >= 0.30 ? "uncertain" : "not_used",
      }];
    });
    return sourceUsage.length === candidates.length ? { sourceUsage, jev } : { sourceUsage: [] };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return { sourceUsage: [] };
  }
}
