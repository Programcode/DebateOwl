import {
  evaluateCrossfireExchange,
  type CrossfireSignalJev,
  type CrossfireSignalTurn,
} from "./crossfire-signals.ts";
import type { CallJevArgs, JevDecisionResult } from "./jev.ts";

const turn = (sequence: number, speaker: "user" | "ai", kind: "question" | "answer", text: string): CrossfireSignalTurn => ({
  id: `T${sequence}`,
  sequence,
  speaker,
  kind,
  text,
});

function signalResult(answerQuality = "direct", concession = "implicit"): JevDecisionResult {
  return {
    model: "typesafe/jev-1.13",
    answers: {
      answer_quality: { type: "choice", choice: answerQuality, confidence: 0.88, probabilities: { direct: 0.88, partial: 0.1, evasive: 0.02 } },
      concession: { type: "choice", choice: concession, confidence: 0.76, probabilities: { none: 0.2, implicit: 0.76, explicit: 0.04 } },
      follow_up: { type: "noul", noul: 0.82 },
    },
  };
}

Deno.test("Crossfire signal evaluates an AI answer added after a user question", async () => {
  const result = await evaluateCrossfireExchange({
    transcript: [turn(1, "user", "question", "What evidence supports that?")],
    reply: { type: "answer", text: "A national survey supports it." },
    callJevImpl: () => Promise.resolve(signalResult("direct", "none")),
  });
  if (result.signal?.answerTurnId !== "T2" || result.signal.answerQuality !== "direct") throw new Error("AI answer signal was not attached to T2");
});

Deno.test("Crossfire signal evaluates the user answer before the next AI question", async () => {
  let state = "";
  const callJevImpl: CrossfireSignalJev = (args) => {
    state = JSON.stringify(args.state);
    return Promise.resolve(signalResult("partial", "implicit"));
  };
  const result = await evaluateCrossfireExchange({
    transcript: [
      turn(1, "ai", "question", "Would costs rise?"),
      turn(2, "user", "answer", "Some costs may rise."),
    ],
    reply: { type: "question", text: "How much would they rise?" },
    callJevImpl,
  });
  if (result.signal?.answerTurnId !== "T2" || result.signal.concession !== "implicit") throw new Error("user answer signal was not attached to T2");
  if (state.includes("How much would they rise?")) throw new Error("next question leaked into the completed exchange state");
});

Deno.test("Crossfire signal sends only the newest completed exchange", async () => {
  let observed: CallJevArgs["state"] | undefined;
  await evaluateCrossfireExchange({
    transcript: [
      turn(1, "user", "question", "Old question"),
      turn(2, "ai", "answer", "Old answer"),
      turn(3, "user", "question", "Newest question"),
    ],
    reply: { type: "answer", text: "Newest answer" },
    callJevImpl: (args) => {
      observed = args.state;
      return Promise.resolve(signalResult());
    },
  });
  const serialized = JSON.stringify(observed);
  if (serialized.includes("Old question") || !serialized.includes("Newest answer")) throw new Error("signal state was not limited to newest exchange");
});

Deno.test("Crossfire signal skips missing exchanges and invalid or failed decisions", async () => {
  let calls = 0;
  const noPair = await evaluateCrossfireExchange({
    transcript: [],
    reply: { type: "question", text: "Opening question" },
    callJevImpl: () => {
      calls += 1;
      return Promise.resolve(signalResult());
    },
  });
  if (noPair.signal || calls !== 0) throw new Error("Jev ran without a completed exchange");

  const malformed = await evaluateCrossfireExchange({
    transcript: [turn(1, "user", "question", "Question")],
    reply: { type: "answer", text: "Answer" },
    callJevImpl: () => Promise.resolve({ model: "typesafe/jev-1.13", answers: {} }),
  });
  if (malformed.signal) throw new Error("malformed decision produced a signal");

  const failed = await evaluateCrossfireExchange({
    transcript: [turn(1, "user", "question", "Question")],
    reply: { type: "answer", text: "Answer" },
    callJevImpl: () => Promise.reject(new Error("Jev 500")),
  });
  if (failed.signal) throw new Error("failed decision discarded the optional-signal contract");
});

Deno.test("Crossfire signal does not start work after caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Cancelled", "AbortError"));
  let calls = 0;
  try {
    await evaluateCrossfireExchange({
      transcript: [turn(1, "user", "question", "Question")],
      reply: { type: "answer", text: "Answer" },
      signal: controller.signal,
      callJevImpl: () => {
        calls += 1;
        return Promise.resolve(signalResult());
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError" || calls !== 0) throw error;
    return;
  }
  throw new Error("pre-aborted signal was ignored");
});
