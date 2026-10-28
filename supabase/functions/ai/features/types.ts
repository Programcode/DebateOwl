// The request-scoped context the ai entrypoint hands to each feature handler.
// Authentication, entitlements, routing, source ranking, and usage accounting
// happen once in index.ts; handlers only build prompts and shape output.

import type { NormalizedUsage } from "../../_shared/cost.ts";
import type { ReasoningEffort } from "../../_shared/model-catalog.ts";
import type { Feature, PromptSource } from "../../_shared/prompts.ts";
import type { Provider, ResearchContext, ResearchDeps } from "../../_shared/research.ts";
import type { SourceAssessment, SourceDecisionCandidate } from "../../_shared/source-decisions.ts";
import type { AIResult, GenerationStream } from "../provider.ts";

export interface FeatureContext {
  req: Request;
  userId: string;
  provider: Provider;
  model: string;
  reasoningEffort: ReasoningEffort;
  /** Caller cancellation combined with the shared request budget. */
  workSignal: AbortSignal;
  /** The client asked for a spoken opponent reply (voice round). */
  voice: boolean;
  /** Live generation sink: the main provider call's tokens and progress. */
  stream?: GenerationStream;
  /** Sanitized, control-validated feature input. */
  input: Record<string, unknown>;
  /** Library sources after ranking, ready for the prompt. */
  sources: PromptSource[];
  sourceAssessments: SourceAssessment[];
  sourceDecisionCandidates: SourceDecisionCandidate[];
  researchDeps: ResearchDeps;
  startTime: number;
  /** Drains research sub-call usage into the parent request's usage row. */
  researchUsageForLog: () => NormalizedUsage[];
  /** Keeps the main provider result so a later failure still bills it. */
  recordMainResult: (result: AIResult) => AIResult;
  buildSystemPromptFor: (feature: Feature, research?: ResearchContext | null, promptSources?: PromptSource[]) => Promise<string>;
  /** Marks the response as built from shortened input. */
  markTruncated: () => void;
  /** Wraps a success payload with shared metadata and headers. */
  respond: (payload: Record<string, unknown>) => Promise<Response>;
}

// Research counts only when it actually returned something to cite.
export function hasResearch(research?: ResearchContext | null): research is ResearchContext {
  return Boolean(research && (research.rankedResults.length > 0 || research.readContent.length > 0));
}
