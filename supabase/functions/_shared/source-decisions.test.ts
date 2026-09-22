import {
  identifyCaseSourceUsage,
  rankSourcesForRequest,
  type SourceDecisionJev,
} from "./source-decisions.ts";
import type { CallJevArgs, JevDecisionResult } from "./jev.ts";

const sources = [
  { key: "official", title: "Official report", content: "Primary statistics", type: "url", qualityScore: 90, qualityLabel: "strong" as const },
  { key: "study", title: "Peer reviewed study", content: "Measured effects", type: "url", qualityScore: 80, qualityLabel: "strong" as const },
  { key: "forum", title: "Forum post", content: "Personal opinion", type: "url", qualityScore: 10, qualityLabel: "weak" as const },
];

function answersFor(args: CallJevArgs, values: Array<{ relevance: number; importance: number; strength: number; confidence?: number }>): JevDecisionResult {
  const answers: JevDecisionResult["answers"] = {};
  values.forEach((value, index) => {
    answers[`source_${index}_relevance`] = { type: "noul", noul: value.relevance };
    for (const field of ["importance", "strength"] as const) {
      const score = value[field];
      answers[`source_${index}_${field}`] = {
        type: "score",
        score,
        confidence: value.confidence ?? 0.9,
        probabilities: { "0": 0.01, "1": 0.02, "2": 0.07, "3": 0.9 },
        legend: { "0": "None", "1": "Low", "2": "Medium", "3": "High" },
      };
    }
  });
  for (const id of Object.keys(args.questions)) if (!answers[id]) throw new Error(`missing fixture answer ${id}`);
  return { model: "typesafe/jev-1.13", answers };
}

Deno.test("semantic source ranking keeps weak evidence below non-weak candidates", async () => {
  const callJevImpl: SourceDecisionJev = (args) => Promise.resolve(answersFor(args, [
    { relevance: 0.8, importance: 1, strength: 1 },
    { relevance: 0.9, importance: 3, strength: 3 },
    { relevance: 0.99, importance: 3, strength: 3 },
  ]));
  const result = await rankSourcesForRequest({ feature: "generate", requestText: "motion", sources, callJevImpl });
  if (result.sources.map((source) => source.key).join(",") !== "study,official,forum") {
    throw new Error(`unexpected order: ${result.sources.map((source) => source.key)}`);
  }
  if (result.assessments.find((item) => item.key === "forum")?.retained) throw new Error("weak source was retained");
});

Deno.test("all low-confidence semantic scores preserve deterministic source order", async () => {
  const callJevImpl: SourceDecisionJev = (args) => Promise.resolve(answersFor(args, [
    { relevance: 0.9, importance: 1, strength: 1, confidence: 0.3 },
    { relevance: 0.95, importance: 3, strength: 3, confidence: 0.3 },
    { relevance: 0.99, importance: 3, strength: 3, confidence: 0.3 },
  ]));
  const result = await rankSourcesForRequest({ feature: "generate", requestText: "motion", sources, callJevImpl });
  if (result.sources.map((source) => source.key).join(",") !== "official,study,forum") throw new Error("low-confidence batch reordered sources");
});

Deno.test("all irrelevant semantic scores preserve deterministic source order", async () => {
  const callJevImpl: SourceDecisionJev = (args) => Promise.resolve(answersFor(args, [
    { relevance: 0.1, importance: 1, strength: 1 },
    { relevance: 0.2, importance: 3, strength: 3 },
    { relevance: 0.3, importance: 3, strength: 3 },
  ]));
  const result = await rankSourcesForRequest({ feature: "generate", requestText: "motion", sources, callJevImpl });
  if (result.sources.map((source) => source.key).join(",") !== "official,study,forum") throw new Error("all-irrelevant batch reordered sources");
});

Deno.test("failed or malformed Jev source decisions preserve deterministic source order", async () => {
  for (const callJevImpl of [
    () => Promise.reject(new Error("unavailable")),
    () => Promise.resolve({ model: "typesafe/jev-1.13", answers: {} }),
  ] satisfies SourceDecisionJev[]) {
    const result = await rankSourcesForRequest({ feature: "generate", requestText: "motion", sources, callJevImpl });
    if (result.sources.map((source) => source.key).join(",") !== "official,study,forum") throw new Error("failed batch reordered sources");
  }
  const failedWithUsage = await rankSourcesForRequest({
    feature: "generate",
    requestText: "motion",
    sources,
    callJevImpl: () => Promise.reject(Object.assign(new Error("malformed"), { usage: { inputTokens: 7, outputTokens: 0 } })),
  });
  if (failedWithUsage.jevUsage?.inputTokens !== 7) throw new Error("failed source-decision usage was discarded");
});

Deno.test("case use requires probability above 0.70 and keeps the middle band uncertain", async () => {
  const callJevImpl: SourceDecisionJev = (args) => Promise.resolve({
    model: "typesafe/jev-1.13",
    answers: {
      source_0_used: { type: "noul", noul: 0.71 },
      source_1_used: { type: "noul", noul: 0.7 },
      source_2_used: { type: "noul", noul: 0.29 },
    },
  });
  const result = await identifyCaseSourceUsage({ caseText: "generated case", sources, callJevImpl });
  if (result.sourceUsage.map((item) => item.judgment).join(",") !== "used,uncertain,not_used") {
    throw new Error(`unexpected judgments: ${result.sourceUsage.map((item) => item.judgment)}`);
  }
});

Deno.test("source decisions bound candidate count, excerpts, and case snapshots", async () => {
  let observedState = "";
  const manySources = Array.from({ length: 14 }, (_, index) => ({
    key: `s${index}`,
    title: `Source ${index}`,
    content: "x".repeat(9_000),
    type: "text",
  }));
  const callJevImpl: SourceDecisionJev = (args) => {
    observedState = JSON.stringify(args.state);
    return Promise.resolve(answersFor(args, Array.from({ length: 10 }, () => ({ relevance: 0.9, importance: 2, strength: 2 }))));
  };
  const ranked = await rankSourcesForRequest({ feature: "ask", requestText: "y".repeat(20_000), sources: manySources, callJevImpl });
  if (ranked.assessments.length !== 10 || ranked.sources.length !== 14) throw new Error("candidate bounds changed source count");
  if (observedState.length > 32_000) throw new Error(`source state exceeded bound: ${observedState.length}`);
});
