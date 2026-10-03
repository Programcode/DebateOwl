import { PROMPT_EXAMPLES } from "./prompt-examples.ts";
import { buildSystemPrompt, buildUserPrompt } from "./system.ts";
import { buildAskBasePrompt } from "./ask.ts";
import type { Feature } from "./common.ts";
import { UNTRUSTED_CONTENT_RULES } from "./context.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// The feature-specific quality rules each prompt must carry.
const QUALITY_RULES: Record<Feature, string[]> = {
  generate: ["SPEECH-READY CONTENTIONS", "weigh it", "TEAM CONSISTENCY"],
  attack: ["TARGET, FLAW, RESPONSE", "exact words from CASE TEXT", "word for word"],
  brainstorm: ["GENUINELY DIFFERENT DIRECTIONS", "same response are one idea"],
  factoids: ["CUTTABLE AND HONEST", "limitations: never empty", "Never round, combine, or extrapolate"],
  ask: ["Do what the Mode asks, directly", "Use only what you received"],
  crossfire: ["Track the real exchange", "A concession exists only when"],
  sparring: ["STAY IN ROLE", "EVIDENCE-LINKED FEEDBACK", "never imply you heard the speeches"],
};

// The full-stack fake provider routes on these lines (e2e/full-stack/fake-openrouter.mjs).
const ROUTE_MARKERS: Record<Feature, string> = {
  generate: "Generate a tournament-ready debate case",
  attack: "Analyze the opponent's case clearly",
  brainstorm: "Brainstorm arguments like experienced competitive debaters",
  factoids: "You are a debate research specialist",
  ask: "You are a debate coach chat bot",
  sparring: "live debate sparring opponent",
  crossfire: "You are DebateLab's crossfire coach",
};

function promptsFor(example: typeof PROMPT_EXAMPLES[number]) {
  const score = example.feature === "sparring" && example.input.action === "score";
  const debateContext = example.debateContext && {
    ...example.debateContext,
    instructions: score || example.feature === "crossfire" ? undefined : example.debateContext.instructions,
    outputs: example.feature === "sparring" ? [] : example.debateContext.outputs,
  };
  const system = buildSystemPrompt({
    feature: example.feature,
    dateContext: "CURRENT DATE: September 27, 2026 (2026)",
    sources: example.feature === "sparring" ? [] : example.sources,
    debateContext,
    researchContext: example.searchContext ? "WEB RESEARCH RESULTS are attached to this request." : undefined,
  });
  const user = example.feature === "ask"
    ? buildAskBasePrompt({ message: String(example.input.message), mode: String(example.input.mode), citationMode: false, webSearchEnabled: false, prosConsMode: false, argumentMapMode: false, researchAvailable: false })
    : buildUserPrompt(example.feature, example.input, example.searchContext ?? "");
  return { system, user, score };
}

for (const example of PROMPT_EXAMPLES) {
  Deno.test(`prompt example ${example.id} carries its quality rules and allowed debate material`, () => {
    const { system, user, score } = promptsFor(example);
    for (const rule of QUALITY_RULES[example.feature]) {
      assert(system.includes(rule), `${example.id}: missing quality rule "${rule}"`);
    }
    assert(system.includes(ROUTE_MARKERS[example.feature]), `${example.id}: the fake-provider route marker changed`);
    assert(!/2025-2026|2026 data is gold/.test(system), `${example.id}: prompt hard-codes a year range`);
    assert(!system.includes("humanizer.md"), `${example.id}: prompt refers to a file the model cannot see`);
    assert(!system.includes("[DATE_CONTEXT]"), `${example.id}: date placeholder left in the prompt`);
    if (example.debateContext) {
      assert(system.includes(example.debateContext.motion), `${example.id}: debate motion missing`);
      assert(system.endsWith(UNTRUSTED_CONTENT_RULES), `${example.id}: student-material rules must close the prompt`);
      const instructionsExpected = !score && example.feature !== "crossfire";
      assert(system.includes("Define homework as work set by teachers") === instructionsExpected,
        `${example.id}: debate instructions ${instructionsExpected ? "missing" : "must stay out"}`);
      for (const output of example.debateContext.outputs) {
        assert(system.includes(output.digest.split("\n")[0]) === (example.feature !== "sparring"),
          `${example.id}: saved result handling is wrong`);
      }
    }
    if (typeof example.input.language === "string" && example.input.language !== "en") {
      assert(`${system}\n${user}`.includes(`(${example.input.language})`), `${example.id}: output language not requested`);
    }
    if (example.feature === "generate") {
      assert(user.includes(`Side: ${example.input.side}`) && user.includes(`Role: ${example.input.role}`), `${example.id}: side or role missing`);
    }
  });
}
