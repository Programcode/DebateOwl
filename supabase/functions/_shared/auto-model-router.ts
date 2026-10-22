import {
  AUTO_FAST,
  AUTO_PRO,
  getModelCatalogEntry,
  isAutoModelSelection,
  type ModelCatalogEntry,
  type ModelSelection,
} from "./model-catalog.ts";
import {
  callJev,
  getJevErrorUsage,
  type CallJevArgs,
  type JevDecisionResult,
} from "./jev.ts";
import type { NormalizedUsage } from "./cost.ts";

const ROUTING_CONFIDENCE = 0.55;
const MAX_ROUTING_STATE_CHARS = 8_000;

const FAST_CANDIDATES = {
  "anthropic/claude-haiku-5.5": "Default for ordinary DebateLab work: cases, rebuttals, coaching, and structured output.",
  "openai/gpt-6-luna": "Best for short latency-sensitive conversation and simple coaching.",
  "meta/muse-spark-1.3-contributor": "Best for very long input, multilingual output, or broad context handling.",
} as const;

// Opus is opt-in only: Auto Pro never routes or falls back to it.
const PRO_CANDIDATES = {
  "anthropic/claude-sonnet-5.5": "Default for professional DebateLab work: nuanced rhetoric, adversarial critique, and long-form writing.",
  "openai/gpt-6.1-sol": "Best for complex structured reasoning and reliable multi-part analysis.",
} as const;

type AutoCandidate = keyof typeof FAST_CANDIDATES | keyof typeof PRO_CANDIDATES;

export type AutoModelRouterJev = (args: CallJevArgs) => Promise<JevDecisionResult>;

export interface ResolveModelSelectionArgs {
  requestedModel: ModelSelection;
  feature: string;
  input: unknown;
  canAccessProModels: boolean;
  reasoningEffort?: string;
  sourceCount?: number;
  signal?: AbortSignal;
  callJevImpl?: AutoModelRouterJev;
}

export interface ResolvedModelSelection {
  requestedModel: ModelSelection;
  resolvedModel: string;
  modelEntry: ModelCatalogEntry;
  usedFallback: boolean;
  jev?: JevDecisionResult;
  jevUsage?: NormalizedUsage;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function routingState(args: ResolveModelSelectionArgs) {
  const request = safeStringify(args.input);
  return {
    feature: args.feature.slice(0, 64),
    request: request.slice(0, MAX_ROUTING_STATE_CHARS - 256),
    reasoningEffort: args.reasoningEffort?.slice(0, 16) ?? "low",
    sourceCount: Math.max(0, Math.min(10, args.sourceCount ?? 0)),
  };
}

function fallbackFor(selection: typeof AUTO_FAST | typeof AUTO_PRO): AutoCandidate {
  return selection === AUTO_FAST ? "anthropic/claude-haiku-5.5" : "anthropic/claude-sonnet-5.5";
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || error instanceof DOMException && error.name === "AbortError";
}

export async function resolveModelSelection(args: ResolveModelSelectionArgs): Promise<ResolvedModelSelection> {
  const { requestedModel, canAccessProModels } = args;
  if (!isAutoModelSelection(requestedModel)) {
    const modelEntry = getModelCatalogEntry(requestedModel);
    if (!modelEntry) throw new Error("Unsupported model selection");
    if (modelEntry.isProOnly && !canAccessProModels) throw new Error("This model requires Pro access");
    return { requestedModel, resolvedModel: requestedModel, modelEntry, usedFallback: false };
  }
  if (requestedModel === AUTO_PRO && !canAccessProModels) throw new Error("Auto Pro requires Pro access");

  const candidates = requestedModel === AUTO_FAST ? FAST_CANDIDATES : PRO_CANDIDATES;
  const fallback = fallbackFor(requestedModel);
  let jev: JevDecisionResult | undefined;
  try {
    jev = await (args.callJevImpl ?? callJev)({
      state: routingState(args),
      questions: {
        model: {
          type: "choice",
          instructions: "Which available model is the best fit for this DebateLab request? Prefer the default unless another option has a clear task-specific advantage.",
          criteria: candidates,
        },
      },
      signal: args.signal,
    });
  } catch (error) {
    if (isAbort(error, args.signal)) throw error;
    const modelEntry = getModelCatalogEntry(fallback);
    if (!modelEntry) throw new Error(`Missing fallback model: ${fallback}`);
    const jevUsage = getJevErrorUsage(error);
    return { requestedModel, resolvedModel: fallback, modelEntry, usedFallback: true, ...(jevUsage ? { jevUsage } : {}) };
  }

  const answer = jev.answers.model;
  const selected = answer?.type === "choice" && answer.confidence >= ROUTING_CONFIDENCE &&
      Object.hasOwn(candidates, answer.choice)
    ? answer.choice
    : fallback;
  const modelEntry = getModelCatalogEntry(selected);
  if (!modelEntry) throw new Error(`Missing routed model: ${selected}`);
  return {
    requestedModel,
    resolvedModel: selected,
    modelEntry,
    usedFallback: selected === fallback && (answer?.type !== "choice" || answer.choice !== fallback || answer.confidence < ROUTING_CONFIDENCE),
    jev,
  };
}
