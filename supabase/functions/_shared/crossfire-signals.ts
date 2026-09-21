import {
  callJev,
  type CallJevArgs,
  type JevChoiceAnswer,
  type JevDecisionResult,
  type JevNoulAnswer,
} from "./jev.ts";

export interface CrossfireSignalTurn {
  id: string;
  sequence: number;
  speaker: "user" | "ai";
  kind: "question" | "answer";
  text: string;
}

export interface CrossfireTurnSignal {
  answerTurnId: string;
  answerQuality: "direct" | "partial" | "evasive";
  answerQualityConfidence: number;
  concession: "none" | "implicit" | "explicit";
  concessionConfidence: number;
  followUpOpportunity: number;
}

export type CrossfireSignalJev = (args: CallJevArgs) => Promise<JevDecisionResult>;

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || error instanceof DOMException && error.name === "AbortError";
}

function choice(value: unknown, labels: readonly string[]): JevChoiceAnswer | null {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "choice") return null;
  const answer = value as JevChoiceAnswer;
  return labels.includes(answer.choice) && Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1
    ? answer
    : null;
}

function noul(value: unknown): JevNoulAnswer | null {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "noul") return null;
  const answer = value as JevNoulAnswer;
  return Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1 ? answer : null;
}

function newestCompletedExchange(transcript: CrossfireSignalTurn[], reply: { type: "question" | "answer"; text: string }) {
  const turns = reply.type === "answer"
    ? [...transcript, {
      id: `T${transcript.length + 1}`,
      sequence: transcript.length + 1,
      speaker: "ai" as const,
      kind: "answer" as const,
      text: reply.text,
    }]
    : transcript;
  for (let index = turns.length - 1; index >= 1; index -= 1) {
    const answer = turns[index];
    const question = turns[index - 1];
    if (answer.kind === "answer" && question.kind === "question") return { question, answer };
  }
  return null;
}

export async function evaluateCrossfireExchange({
  transcript,
  reply,
  signal,
  callJevImpl = callJev,
}: {
  transcript: CrossfireSignalTurn[];
  reply: { type: "question" | "answer"; text: string };
  signal?: AbortSignal;
  callJevImpl?: CrossfireSignalJev;
}): Promise<{ signal?: CrossfireTurnSignal; jev?: JevDecisionResult }> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  const exchange = newestCompletedExchange(transcript, reply);
  if (!exchange) return {};
  try {
    const jev = await callJevImpl({
      state: {
        question: { id: exchange.question.id, speaker: exchange.question.speaker, text: exchange.question.text.slice(0, 2_000) },
        answer: { id: exchange.answer.id, speaker: exchange.answer.speaker, text: exchange.answer.text.slice(0, 2_000) },
      },
      questions: {
        answer_quality: {
          type: "choice",
          instructions: "How directly and completely does the answer address the question?",
          criteria: { direct: "Direct and complete", partial: "Addresses only part", evasive: "Avoids the question" },
        },
        concession: {
          type: "choice",
          instructions: "What level of concession does the answer make to the questioner's challenged claim?",
          criteria: { none: "No concession", implicit: "Implicit concession", explicit: "Explicit concession" },
        },
        follow_up: {
          type: "noul",
          instructions: "Does this exchange create a useful immediate follow-up opportunity for the questioner?",
          criteria: { true: "Useful follow-up exists", false: "No useful follow-up" },
        },
      },
      signal,
    });
    if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    const quality = choice(jev.answers.answer_quality, ["direct", "partial", "evasive"]);
    const concession = choice(jev.answers.concession, ["none", "implicit", "explicit"]);
    const followUp = noul(jev.answers.follow_up);
    if (!quality || !concession || !followUp) return {};
    return {
      signal: {
        answerTurnId: exchange.answer.id,
        answerQuality: quality.choice as CrossfireTurnSignal["answerQuality"],
        answerQualityConfidence: quality.confidence,
        concession: concession.choice as CrossfireTurnSignal["concession"],
        concessionConfidence: concession.confidence,
        followUpOpportunity: followUp.noul,
      },
      jev,
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return {};
  }
}
