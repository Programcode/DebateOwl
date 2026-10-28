// max_tokens covers reasoning and the reply together, so a wrong formula
// leaves a model no room to answer. These pin the formula from outside it.

import { assertEquals } from "jsr:@std/assert@1.0.19";
import { outputTokenLimit, REASONING_FLOOR_TOKENS, REPLY_TOKEN_CAPS, type ReplyCap, TRUNCATION_RETRY_FACTOR } from "./output-caps.ts";
import type { ReasoningEffort } from "./model-catalog.ts";

// OpenRouter's Claude budget: max(max_tokens * share, 1024).
// https://openrouter.ai/docs/use-cases/reasoning-tokens
const CLAUDE_SHARE: Record<ReasoningEffort, number> = { low: 0.2, medium: 0.5, high: 0.8 };
const EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];

Deno.test("max_tokens for a known reply and effort", () => {
  assertEquals(outputTokenLimit(1_500, "low", 128_000), 3_548);
  assertEquals(outputTokenLimit(1_500, "medium", 128_000), 5_596);
  assertEquals(outputTokenLimit(1_500, "high", 128_000), 9_692);
  assertEquals(outputTokenLimit(6_000, "high", 128_000), 30_000);
  assertEquals(outputTokenLimit(6_000, "high", 20_000), 20_000);
});

Deno.test("every cap leaves its full reply after Claude's reasoning budget and after the floor for other models", () => {
  for (const [cap, reply] of Object.entries(REPLY_TOKEN_CAPS)) {
    for (const effort of EFFORTS) {
      for (const replyTokens of [reply, reply * TRUNCATION_RETRY_FACTOR]) {
        const limit = outputTokenLimit(replyTokens, effort, 128_000, REASONING_FLOOR_TOKENS[cap as ReplyCap]);
        const claudeBudget = Math.max(Math.floor(limit * CLAUDE_SHARE[effort]), 1_024);
        if (limit - claudeBudget < replyTokens) throw new Error(`${cap} at ${effort}: Claude keeps ${limit - claudeBudget} of ${replyTokens}`);
        if (limit - replyTokens < 2_048) throw new Error(`${cap} at ${effort}: only ${limit - replyTokens} tokens for reasoning`);
      }
    }
  }
});

Deno.test("a case keeps 10,000 tokens for reasoning at low effort, on the first try and the retry", () => {
  // Claude Haiku reasoned for up to 10,000 tokens on an R2 case at low effort;
  // with 3,000 of room one reply was cut off and its retry nearly timed out.
  const floor = REASONING_FLOOR_TOKENS.generate;
  assertEquals(outputTokenLimit(REPLY_TOKEN_CAPS.generate, "low", 128_000, floor), 22_000);
  assertEquals(outputTokenLimit(REPLY_TOKEN_CAPS.generate * TRUNCATION_RETRY_FACTOR, "low", 128_000, floor), 34_000);
  // A floor below the effort's own room changes nothing.
  assertEquals(outputTokenLimit(1_500, "high", 128_000, 1_000), 9_692);
});
