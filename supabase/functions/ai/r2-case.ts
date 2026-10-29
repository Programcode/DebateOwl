// An R2 case written in parts at the same time.
//
// One call wrote the speech and all 12 answers in up to 124 s of the 130 s
// request budget, and the Free plan stops a worker at 150 s, so the budget
// cannot grow. Instead a short plan call (low effort) picks our two arguments
// and the claims to answer, then four parts write from it in parallel at the
// student's model and effort: part 1 the speech and three answers (streamed to
// the browser), parts 2-4 three answers each. The slowest part is about a
// quarter of the old reply.

import { mergeNormalizedUsage, type NormalizedUsage } from "../_shared/cost.ts";
import type { ReasoningEffort } from "../_shared/model-catalog.ts";
import type { ReplyCap } from "../_shared/output-caps.ts";
import { type R2Plan, r2CounterCount, r2PartInstruction, r2PlanInstruction } from "../_shared/prompts/generate.ts";
import type { Provider } from "../_shared/research.ts";
import { type AIResult, AIResponseValidationError, type GenerationStream } from "./provider.ts";

export const R2_PARTS = 4;

type CallAI = (
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  reasoningEffort: ReasoningEffort,
  cap: ReplyCap,
  signal?: AbortSignal,
  stream?: GenerationStream,
) => Promise<AIResult>;

export interface R2CaseRequest {
  callAI: CallAI;
  provider: Provider;
  model: string;
  reasoningEffort: ReasoningEffort;
  systemPrompt: string;
  /** The ordinary generate user prompt; each step appends its own instruction. */
  userPrompt: string;
  length: string;
  signal: AbortSignal;
  stream?: GenerationStream;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const line = (value: unknown, max: number): string => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Reads the plan the model returned. A plan short of claims still makes a
 * usable case down to the R2 floor (three short of the target), as
 * enforceGenerateControls allows; anything thinner fails the request.
 */
export function parseR2Plan(output: unknown, counterCount: number): R2Plan | string {
  const plan = record(output);
  if (!plan) return "plan";
  const ourArguments = (Array.isArray(plan.ourArguments) ? plan.ourArguments : [])
    .map((item) => ({ title: line(record(item)?.title, 120), claim: line(record(item)?.claim, 400) }))
    .filter((item) => item.title && item.claim)
    .slice(0, 2);
  if (ourArguments.length === 0) return "plan.ourArguments";
  const seen = new Set<string>();
  const theirClaims = (Array.isArray(plan.theirClaims) ? plan.theirClaims : [])
    .map((claim) => line(claim, 400))
    .filter((claim) => claim && !seen.has(claim.toLowerCase()) && seen.add(claim.toLowerCase()))
    .slice(0, counterCount);
  if (theirClaims.length < counterCount - 3) return "plan.theirClaims";
  return { ourArguments, theirClaims };
}

/** Part 1 also writes the speech, so it takes the smallest share of claims; the rest split evenly. */
export function splitR2Claims(claims: string[], parts = R2_PARTS): string[][] {
  const first = Math.floor(claims.length / parts);
  const rest = claims.slice(first);
  const chunks = [claims.slice(0, first)];
  for (let index = 0, start = 0; index < parts - 1; index++) {
    const size = Math.ceil((rest.length - start) / (parts - 1 - index));
    chunks.push(rest.slice(start, start + size));
    start += size;
  }
  return chunks.filter((chunk, index) => index === 0 || chunk.length > 0);
}

/** Part 1's case with every part's answers in plan order and each source once. */
export function mergeR2Parts(outputs: unknown[]): Record<string, unknown> {
  const parts = outputs.map((output) => record(output) ?? {});
  const seen = new Set<string>();
  const sources = parts.flatMap((part) => Array.isArray(part.sources) ? part.sources : []).filter((source) => {
    const item = record(source);
    if (!item) return false;
    const key = (typeof item.url === "string" && item.url) || `${String(item.org ?? "").toLowerCase()}|${String(item.year ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...parts[0],
    contentions: [],
    counters: parts.flatMap((part) => Array.isArray(part.counters) ? part.counters : []),
    sources,
  };
}

/** Bills every call the failed request made, then hands back the first real failure. */
function withUsage(error: unknown, usage: NormalizedUsage | undefined, completedUsage: NormalizedUsage | undefined): unknown {
  const failure = (error && typeof error === "object" ? error : new Error(String(error))) as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage };
  if (usage) failure.usage = usage;
  if (completedUsage) failure.completedUsage = completedUsage;
  return failure;
}

export async function writeR2Case(request: R2CaseRequest): Promise<AIResult> {
  const { callAI, provider, model, reasoningEffort, systemPrompt, userPrompt, length, signal, stream } = request;
  const counterCount = r2CounterCount(length);
  const ask = (instruction: string) => [{ role: "user", content: `${userPrompt}\n\n${instruction}` }];

  // The plan is short and decides what each part writes, so it runs at low
  // effort; the parts keep the student's effort for the writing itself.
  const planResult = await callAI(provider, model, systemPrompt, ask(r2PlanInstruction(counterCount)), "low", "casePlan", signal);
  const plan = parseR2Plan(planResult.output, counterCount);
  if (typeof plan === "string") throw new AIResponseValidationError(plan, planResult.usage);

  // One failed part fails the case, so stop the others at once.
  const stopParts = new AbortController();
  const partSignal = AbortSignal.any([signal, stopParts.signal]);
  let firstFailure = undefined as { error: unknown } | undefined;
  // Part 1 streams the draft; the answer is finished only once every part is.
  const partStream = stream && { ...stream, finished: undefined };
  const chunks = splitR2Claims(plan.theirClaims);
  let firstNumber = 1;
  const settled = await Promise.allSettled(chunks.map((claims, index) => {
    const instruction = r2PartInstruction(plan, claims, firstNumber, index + 1, chunks.length, length);
    firstNumber += claims.length;
    return callAI(provider, model, systemPrompt, ask(instruction), reasoningEffort, "caseWriterPart", partSignal, index === 0 ? partStream : undefined)
      .catch((error) => {
        firstFailure ??= { error };
        stopParts.abort();
        throw error;
      });
  }));

  const partUsage = settled.map((result) => result.status === "fulfilled"
    ? result.value.usage
    : record(result.reason)?.usage as NormalizedUsage | undefined);
  const usage = mergeNormalizedUsage([planResult.usage, ...partUsage]);
  if (firstFailure) {
    const completed = mergeNormalizedUsage([planResult.usage, ...settled.map((result) => result.status === "fulfilled" ? result.value.usage : undefined)]);
    throw withUsage(firstFailure.error, usage, completed);
  }
  stream?.finished?.();
  return {
    output: mergeR2Parts(settled.map((result) => (result as PromiseFulfilledResult<AIResult>).value.output)),
    usage,
  };
}
