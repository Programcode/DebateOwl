import { buildUserPrompt, getAskModeGuidance } from "./prompt-builder.ts";

function assertIncludes(text: string, expected: string) {
  if (!text.includes(expected)) {
    throw new Error(`Expected prompt to include "${expected}", but it was missing.\nPrompt:\n${text}`);
  }
}

Deno.test("generate prompt includes language and generation controls", () => {
  const prompt = buildUserPrompt("generate", {
    motion: "This house would regulate social media algorithms",
    side: "pro",
    format: "custom",
    role: "r1",
    length: "comprehensive",
    audience: "advanced",
    tone: "aggressive",
    language: "es",
  }, "SEARCH CONTEXT");

  assertIncludes(prompt, "Motion: This house would regulate social media algorithms");
  assertIncludes(prompt, "Side: pro");
  assertIncludes(prompt, "Format: custom");
  assertIncludes(prompt, "Role: r1");
  assertIncludes(prompt, "Length: comprehensive");
  assertIncludes(prompt, "Audience: advanced");
  assertIncludes(prompt, "Tone: aggressive");
  assertIncludes(prompt, "Language: Spanish (es)");
  assertIncludes(prompt, "SEARCH CONTEXT");
});

Deno.test("attack prompt includes intensity, paradigm, and toggle states", () => {
  const prompt = buildUserPrompt("attack", {
    caseText: "Nuclear energy should replace fossil fuels.",
    aggressiveness: "ruthless",
    judgeParadigm: "policy",
    detectFallacies: false,
    analyzeWeighing: true,
  }, "SEARCH CONTEXT");

  assertIncludes(prompt, "Attack Intensity: ruthless");
  assertIncludes(prompt, "Judge Paradigm: policy");
  assertIncludes(prompt, "Detect Fallacies: disabled");
  assertIncludes(prompt, "Analyze Weighing: enabled");
  assertIncludes(prompt, "CASE TEXT:");
  assertIncludes(prompt, "SEARCH CONTEXT");
});

Deno.test("brainstorm prompt includes side, output mode, and context", () => {
  const prompt = buildUserPrompt("brainstorm", {
    motion: "Ban private cars in city centers",
    side: "both",
    outputMode: "mindmap",
    context: "Need arguments for a school debate.",
  }, "SEARCH CONTEXT");

  assertIncludes(prompt, "Motion: Ban private cars in city centers");
  assertIncludes(prompt, "Side: both");
  assertIncludes(prompt, "Output Mode: mindmap");
  assertIncludes(prompt, "Context: Need arguments for a school debate.");
  assertIncludes(prompt, "SEARCH CONTEXT");
});

Deno.test("factoids prompt includes source filters and language", () => {
  const prompt = buildUserPrompt("factoids", {
    claim: "Solar is cheaper than coal",
    region: "United States",
    sourceType: "government",
    timeframe: "2020-2025",
    language: "en",
  }, "SEARCH CONTEXT");

  assertIncludes(prompt, "Find evidence for claim: \"Solar is cheaper than coal\"");
  assertIncludes(prompt, "Region: United States");
  assertIncludes(prompt, "Source Type: government");
  assertIncludes(prompt, "Timeframe: 2020-2025");
  assertIncludes(prompt, "Language: English (en)");
});

Deno.test("ask prompt includes mode guidance", () => {
  const prompt = buildUserPrompt("ask", {
    message: "Help me prep cross-ex questions.",
    mode: "argumentmap",
  }, "");

  assertIncludes(prompt, "Mode: argumentmap");
  assertIncludes(prompt, "Mode Guidance: Map the claim, supports, counters, and assumptions explicitly.");
});

Deno.test("ask mode guidance falls back to general", () => {
  const guidance = getAskModeGuidance("unknown-mode");
  if (guidance !== "Give a balanced, practical coaching answer.") {
    throw new Error(`Expected fallback guidance, got "${guidance}"`);
  }
});
