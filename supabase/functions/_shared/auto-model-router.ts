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

// Auto only routes to Claude, which runs on DebateOwl's Anthropic key (BYOK in
// OpenRouter). Every other family bills OpenRouter credits, so Auto never picks
// one; a student can still choose one by hand. With one candidate per pool the
// Jev routing call is skipped (it would bill OpenRouter credits for nothing).
// Add a candidate only if it is an anthropic/ model: auto-model-router.test.ts
// and src/test/ai/anthropic-only-guard.test.ts fail otherwise.
export const FAST_CANDIDATES = {
  "anthropic/claude-haiku-5.5": "Default for ordinary DebateOwl work: cases, rebuttals, coaching, and structured output.",
} as const;

// Opus is opt-in only: Auto Pro never routes or falls back to it.
export const PRO_CANDIDATES = {
  "anthropic/claude-sonnet-5.5": "Default for professional DebateOwl work: nuanced rhetoric, adversarial critique, and long-form writing.",
} as const;

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

function fallbackFor(selection: typeof AUTO_FAST | typeof AUTO_PRO): string {
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
  const candidates: Readonly<Record<string, string>> = requestedModel === AUTO_FAST ? FAST_CANDIDATES : PRO_CANDIDATES;
  return await routeAmongCandidates(args, candidates, fallbackFor(requestedModel));
}

/**
 * Picks one of `candidates` with Jev, or `fallback` when Jev is unsure, fails,
 * or names something outside the pool. A single-candidate pool resolves to it
 * without a Jev call. Exported for tests; callers use resolveModelSelection.
 */
export async function routeAmongCandidates(
  args: ResolveModelSelectionArgs,
  candidates: Readonly<Record<string, string>>,
  fallback: string,
): Promise<ResolvedModelSelection> {
  const { requestedModel } = args;
  const fallbackEntry = getModelCatalogEntry(fallback);
  if (!fallbackEntry) throw new Error(`Missing fallback model: ${fallback}`);
  if (Object.keys(candidates).length === 1 && Object.hasOwn(candidates, fallback)) {
    return { requestedModel, resolvedModel: fallback, modelEntry: fallbackEntry, usedFallback: false };
  }
  let jev: JevDecisionResult | undefined;
  try {
    jev = await (args.callJevImpl ?? callJev)({
      state: routingState(args),
      questions: {
        model: {
          type: "choice",
          instructions: "Which available model is the best fit for this DebateOwl request? Prefer the default unless another option has a clear task-specific advantage.",
          criteria: candidates,
        },
      },
      signal: args.signal,
    });
  } catch (error) {
    if (isAbort(error, args.signal)) throw error;
    const jevUsage = getJevErrorUsage(error);
    return { requestedModel, resolvedModel: fallback, modelEntry: fallbackEntry, usedFallback: true, ...(jevUsage ? { jevUsage } : {}) };
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
