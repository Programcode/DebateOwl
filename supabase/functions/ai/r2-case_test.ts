import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import type { NormalizedUsage } from "../_shared/cost.ts";
import type { AIResult, GenerationStream } from "./provider.ts";
import { parseR2Plan, writeR2Case } from "./r2-case.ts";

const usage = (cost: number): NormalizedUsage => ({ inputTokens: 100, outputTokens: 10, reportedCostUsd: cost, capCostUsd: cost });
const plan = {
  ourArguments: [{ title: "Bullying", claim: "Bullying follows pupils home." }, { title: "Unequal care", claim: "Help depends on background." }],
  theirClaims: Array.from({ length: 12 }, (_, index) => `claim ${index + 1}`),
};
const cents = (usd?: number) => Math.round((usd ?? NaN) * 100);
const partClaims = (prompt: string) => [...prompt.matchAll(/^(\d+)\) (claim \d+)$/gm)].map((match) => match[2]);

function request(callAI: (prompt: string, cap: string, signal?: AbortSignal, stream?: GenerationStream) => Promise<AIResult>, stream?: GenerationStream) {
  return {
    callAI: (_provider: string, _model: string, _system: string, messages: Array<{ content: string }>, _effort: string, cap: string, signal?: AbortSignal, partStream?: GenerationStream) =>
      callAI(messages[0].content, cap, signal, partStream),
    provider: "openrouter" as const,
    model: "anthropic/claude-sonnet-5.5",
    reasoningEffort: "medium" as const,
    systemPrompt: "SYSTEM",
    userPrompt: "Role: r2",
    length: "standard",
    signal: new AbortController().signal,
    stream,
  };
}

Deno.test("an R2 case keeps every planned answer in plan order, streams only part 1, and finishes once", async () => {
  const streamed: number[] = [];
  let finished = 0;
  const stream = { delta: () => {}, reset: () => {}, phase: () => {}, finished: () => finished++ } as GenerationStream;
  const result = await writeR2Case(request(async (prompt, cap, _signal, partStream) => {
    if (cap === "casePlan") return { output: plan, usage: usage(0.01) };
    const part = Number(/WRITING PART (\d+)/.exec(prompt)![1]);
    if (partStream) streamed.push(part);
    // Part 1 must not mark the answer finished while the others still write.
    partStream?.finished?.();
    return {
      output: {
        ...(part === 1 ? { opening: { hook: "hook" }, reinforce: [{ argument: "a", text: "t" }], closingLine: "close" } : {}),
        counters: partClaims(prompt).map((targetArgument) => ({ targetArgument, counterpoint: "answer" })),
        sources: [{ org: "KSH", year: "2025", url: "https://ksh.hu/a" }, { org: `Part ${part}`, year: "2024" }],
      },
      usage: usage(0.1),
    };
  }, stream));

  const output = result.output as { counters: Array<{ targetArgument: string }>; sources: unknown[]; closingLine: string };
  assertEquals(output.counters.map((counter) => counter.targetArgument), plan.theirClaims);
  assertEquals(output.sources.length, 5);
  assertEquals(output.closingLine, "close");
  assertEquals(streamed, [1]);
  assertEquals(finished, 1);
  assertEquals(cents(result.usage?.reportedCostUsd), 41);
});

Deno.test("a failed R2 part stops the other parts and bills every call", async () => {
  const error = await assertRejects(() => writeR2Case(request(async (prompt, cap, signal) => {
    if (cap === "casePlan") return { output: plan, usage: usage(0.01) };
    if (prompt.includes("WRITING PART 2")) throw Object.assign(new Error("provider down"), { usage: usage(0.02) });
    // The other parts run until they are stopped, then report what they used.
    await new Promise((_, reject) => signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { usage: usage(0.03) }))));
    throw new Error("unreachable");
  })), Error, "provider down") as Error & { usage?: NormalizedUsage; completedUsage?: NormalizedUsage };
  assertEquals(cents(error.usage?.capCostUsd), 12);
  assertEquals(cents(error.completedUsage?.capCostUsd), 1);
});

Deno.test("an R2 plan too thin for the case is refused", () => {
  assertEquals(parseR2Plan({ ourArguments: plan.ourArguments, theirClaims: plan.theirClaims.slice(0, 8) }, 12), "plan.theirClaims");
  assertEquals(parseR2Plan({ ourArguments: [], theirClaims: plan.theirClaims }, 12), "plan.ourArguments");
  assertEquals((parseR2Plan({ ...plan, theirClaims: [...plan.theirClaims, "claim 1"] }, 12) as { theirClaims: string[] }).theirClaims.length, 12);
});
