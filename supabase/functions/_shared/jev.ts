import {
  normalizeOpenRouterUsage,
  type NormalizedUsage,
} from "./cost.ts";
import {
  MAX_PROVIDER_ERROR_BODY_BYTES,
  MAX_PROVIDER_ERROR_BODY_CHARS,
  MAX_PROVIDER_RESPONSE_BYTES,
  readResponseText,
} from "./research.ts";

export const JEV_MODEL = "typesafe/jev-1.13";
export const JEV_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const JEV_TIMEOUT_MS = 8_000;

type JsonPrimitive = string | number | boolean | null;
export type JevState = JsonPrimitive | JevState[] | { [key: string]: JevState };

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: readonly [string, string, ...string[]];
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevDecisionResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: NormalizedUsage;
}

export interface CallJevArgs {
  state: JevState;
  questions: Record<string, JevQuestion>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedProbability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function sameKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseProbabilities(value: unknown, expected: readonly string[]): Record<string, number> | null {
  const record = asRecord(value);
  if (!record || !sameKeys(record, expected)) return null;
  const parsed: Record<string, number> = {};
  for (const key of expected) {
    const probability = boundedProbability(record[key]);
    if (probability === null) return null;
    parsed[key] = probability;
  }
  return parsed;
}

function parseAnswer(id: string, question: JevQuestion, value: unknown): JevAnswer {
  const answer = asRecord(value);
  if (!answer || answer.type !== question.type) throw new Error(`Invalid Jev answer for ${id}`);

  if (question.type === "noul") {
    const noul = boundedProbability(answer.noul);
    if (noul === null) throw new Error(`Invalid Jev answer for ${id}`);
    return { type: "noul", noul };
  }

  const confidence = boundedProbability(answer.confidence);
  if (confidence === null) throw new Error(`Invalid Jev answer for ${id}`);

  if (question.type === "choice") {
    const labels = Object.keys(question.criteria);
    const choice = typeof answer.choice === "string" && labels.includes(answer.choice)
      ? answer.choice
      : null;
    const probabilities = parseProbabilities(answer.probabilities, labels);
    if (!choice || !probabilities) throw new Error(`Invalid Jev answer for ${id}`);
    return { type: "choice", choice, confidence, probabilities };
  }

  const score = typeof answer.score === "number" && Number.isFinite(answer.score) &&
      answer.score >= 0 && answer.score <= question.criteria.length - 1
    ? answer.score
    : null;
  const indexes = question.criteria.map((_, index) => String(index));
  const probabilities = parseProbabilities(answer.probabilities, indexes);
  const rawLegend = asRecord(answer.legend);
  if (score === null || !probabilities || !rawLegend || !sameKeys(rawLegend, indexes)) {
    throw new Error(`Invalid Jev answer for ${id}`);
  }
  const legend: Record<string, string> = {};
  for (const index of indexes) {
    if (rawLegend[index] !== question.criteria[Number(index)]) {
      throw new Error(`Invalid Jev answer for ${id}`);
    }
    legend[index] = question.criteria[Number(index)];
  }
  return { type: "score", score, confidence, probabilities, legend };
}

function normalizeJevUsage(value: unknown): NormalizedUsage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const normalized = normalizeOpenRouterUsage({
    ...usage,
    prompt_tokens: usage.prompt_tokens ?? usage.input_tokens,
    completion_tokens: usage.completion_tokens ?? usage.output_tokens,
  });
  return { ...normalized, raw: usage };
}

export async function callJev({
  state,
  questions,
  signal,
  fetchImpl = globalThis.fetch,
  apiKey = Deno.env.get("OPENROUTER_API_KEY"),
  timeoutMs = JEV_TIMEOUT_MS,
}: CallJevArgs): Promise<JevDecisionResult> {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const questionIds = Object.keys(questions);
  if (questionIds.length === 0) throw new Error("Jev requires at least one question");

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Jev request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    const response = await fetchImpl(JEV_DECISIONS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await readResponseText(
        response,
        MAX_PROVIDER_ERROR_BODY_BYTES,
        MAX_PROVIDER_ERROR_BODY_CHARS,
        controller.signal,
        true,
      );
      throw new Error(`OpenRouter Jev error ${response.status}: ${body.text}`);
    }

    const body = await readResponseText(
      response,
      MAX_PROVIDER_RESPONSE_BYTES,
      MAX_PROVIDER_RESPONSE_BYTES,
      controller.signal,
      false,
    );
    const payload = asRecord(JSON.parse(body.text));
    const rawAnswers = asRecord(payload?.answers);
    const model = typeof payload?.model === "string" && payload.model ? payload.model : null;
    if (!payload || !rawAnswers || !model) {
      throw new Error("Invalid Jev response envelope");
    }
    for (const id of questionIds) {
      if (!(id in rawAnswers)) throw new Error(`Missing Jev answer for ${id}`);
    }
    if (!sameKeys(rawAnswers, questionIds)) throw new Error("Invalid Jev response envelope");

    const answers: Record<string, JevAnswer> = {};
    for (const id of questionIds) answers[id] = parseAnswer(id, questions[id], rawAnswers[id]);
    return { model, answers, usage: normalizeJevUsage(payload.usage) };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
