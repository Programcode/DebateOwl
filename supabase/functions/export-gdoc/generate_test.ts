for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { buildGenerateContent } = await import("./index.ts");

/** The document text, in the order the export inserts it. */
function documentText(data: Parameters<typeof buildGenerateContent>[0]): string {
  return buildGenerateContent(data).requests
    .flatMap((request) => "insertText" in request && request.insertText ? [request.insertText.text] : [])
    .join("");
}

function assertIncludes(text: string, expected: string) {
  if (!text.includes(expected)) throw new Error(`document is missing "${expected}"\n---\n${text}`);
}

function assertExcludes(text: string, unexpected: RegExp) {
  if (unexpected.test(text)) throw new Error(`document must not contain ${unexpected}\n---\n${text}`);
}

Deno.test("Google Docs export writes a new case's opening, arguments, answers, closing line and sources", () => {
  const text = documentText({
    opening: { hook: "Picture a pupil who hides her phone to use AI at night.", definition: "By minors we mean under-16s." },
    caseStructure: { thesis: "Today we will show 1 argument that proves a ban does more harm than good." },
    contentions: [{ title: "One size fits all", claim: "A total ban ignores that children grow up.", reasoning: "A 7-year-old is not a 17-year-old.", evidence: "UNICEF said in 2025 that age limits alone fail.", impact: "Older pupils lose a learning tool." }],
    counters: [{ targetArgument: "AI makes kids cheat.", counterpoint: "Pupils cheated before AI.", source: "OECD, 2024" }],
    closingLine: "That is why a ban is the wrong answer.",
    sources: [
      { org: "UNICEF", year: "2025", claim: "Age limits alone fail", url: "https://www.unicef.org/report" },
      { org: "Old Wiki", claim: "Never linked", url: "javascript:alert(1)" },
    ],
    metadata: { side: "con", format: "custom", generatedAt: "2026-10-27T10:00:00.000Z" },
  });
  for (const expected of [
    "Opening\n", "Picture a pupil", "What we mean: By minors we mean under-16s.",
    "Argument 1: One size fits all\n", "Point: A total ban ignores", "Explanation: A 7-year-old", "Why it matters: Older pupils",
    "If they say…\n", "They say: AI makes kids cheat.\n", "We answer: Pupils cheated before AI.", "Source: OECD, 2024",
    "Closing line\n", "That is why a ban is the wrong answer.",
    "Sources\n", "• UNICEF (2025) – Age limits alone fail – https://www.unicef.org/report\n", "• Old Wiki – Never linked\n",
  ]) assertIncludes(text, expected);
  assertExcludes(text, /Framework|Burden of Proof|Predicted Opponent Case|javascript:/);
});

Deno.test("Google Docs export still writes a case saved before the restructure", () => {
  const text = documentText({
    exordio: { hook: "Imagine a city where the bus is free.", transition: "That city is closer than you think." },
    caseStructure: { thesis: "Free transit is a net public good.", framework: "Net societal benefit.", burdenOfProof: "We must show a net gain.", keyDefinitions: ["Transit: scheduled buses."] },
    contentions: [{ claim: "Fares block riders.", reasoning: "Fares are regressive.", evidence: "Cities report gains.", impact: "More people reach work." }],
    predictedOpponentCase: { likelyArguments: ["Funding gap", "Overcrowding"] },
    counters: [{ targetArgument: "Funding gap", counterpoint: "Collection has overhead.", rebuttal: "Net cost is small." }],
    metadata: { side: "pro", format: "custom" },
  });
  for (const expected of [
    "Imagine a city where the bus is free. That city is closer than you think.",
    "Free transit is a net public good.", "Framework: Net societal benefit.", "Burden of Proof: We must show a net gain.",
    "Key Definitions: Transit: scheduled buses.", "Argument 1: Fares block riders.\n",
    "We answer: Collection has overhead.", "Rebuttal: Net cost is small.", "Predicted Opponent Case\n", "• Overcrowding\n",
  ]) assertIncludes(text, expected);
  // An argument the answers already cover is not listed again.
  assertExcludes(text, /• Funding gap/);
});

Deno.test("Google Docs export gives a Conclusor case its reasons why we win", () => {
  const text = documentText({
    caseStructure: { thesis: "Here is why we won." },
    contentions: [],
    counters: [],
    whyWeWin: ["They never answered our point.", "Only we showed who gets to school."],
    metadata: { side: "pro" },
  });
  assertIncludes(text, "Why we win\n1. They never answered our point.\n2. Only we showed who gets to school.\n");
  assertExcludes(text, /Arguments\n|If they say/);
});
