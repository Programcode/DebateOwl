import { isAskStreamingModeAllowed } from "../_shared/control-enforcement.ts";
import {
  buildStreamingAskSystemPrompt,
  PRODUCT_IDENTITY,
} from "../_shared/prompts.ts";

function assertIncludes(text: string, expected: string) {
  if (!text.includes(expected)) {
    throw new Error(
      `Expected prompt to include "${expected}", but it was missing.\nPrompt:\n${text}`,
    );
  }
}

function assertNotIncludes(text: string, unexpected: string) {
  if (text.includes(unexpected)) {
    throw new Error(
      `Expected prompt not to include "${unexpected}".\nPrompt:\n${text}`,
    );
  }
}

Deno.test("streaming Ask keeps the shared identity, language, and evidence rules", () => {
  const streamingPrompt = buildStreamingAskSystemPrompt(
    "Give a direct coaching answer with concrete debate tactics.",
  );

  for (
    const rule of [
      "You are DebateLab's debate coach.",
      "Follow any explicit output-language instruction. Otherwise match the language used by the user.",
      "Never invent facts, statistics, citations, or sources.",
    ]
  ) {
    assertIncludes(PRODUCT_IDENTITY, rule);
    assertIncludes(streamingPrompt, rule);
  }
  assertIncludes(
    streamingPrompt,
    "Answer in clear Markdown that can stream smoothly token by token.",
  );
  assertIncludes(
    streamingPrompt,
    "If the user asks for sources, explain that citation/search mode should be used.",
  );
  assertNotIncludes(
    streamingPrompt,
    "OUTPUT RULES: Return ONLY a valid JSON object",
  );
});

Deno.test("streaming Ask still allows only general mode", () => {
  if (!isAskStreamingModeAllowed("general")) {
    throw new Error("general Ask mode was rejected");
  }
  for (const mode of ["clarify", "summarize", "proscons", "argumentmap"]) {
    if (isAskStreamingModeAllowed(mode)) {
      throw new Error(`${mode} Ask mode was allowed to stream`);
    }
  }
});
