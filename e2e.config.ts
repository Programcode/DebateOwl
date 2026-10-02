import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { openrouter } from "@openrouter/ai-sdk-provider";

// Agentic browser tests (TesterArmy e2e) against the verify-debatelab stack.
// Run them through `.claude/skills/verify-debatelab/bin/verify.sh e2e`, which
// checks the stack, loads its environment and the OpenRouter key, and keeps
// the evidence. See docs/testing.md#agentic-browser-tests.

// Only the `verify.sh up` client: a plain dev server talks to production Supabase.
const appUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:18081";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(appUrl)) {
  throw new Error(`Agentic tests only drive the local verification stack, not ${appUrl}`);
}

const live = process.env.VERIFY_MODE === "live";

// The model that drives and judges the browser, not the app's own model. It
// needs tool calling and image input. The default is free but slow, and its
// upstream rate-limits under load; E2E_AGENT_MODEL=openai/gpt-6-luna is a fast,
// cheap paid alternative that also explores better.
const model = openrouter(process.env.E2E_AGENT_MODEL ?? "qwen/qwen3.8-27b:free");

// `context` reaches every model call, judges included: what the app calls things.
const context = [
  "DebateLab is a debate training app for students. A motion is the debate topic, such as \"This House would ban homework\".",
  "Each student works in one Current Debate at a time. The header control reads \"Start debate\" until one exists, then names the motion. Tool pages show a strip \"Working in: <motion>\".",
  "Tools: Generate (a full debate case: thesis, contentions, predicted opponent case, prepared counters), Attack, Brainstorm, Factoids, Ask, Sparring (a practice round against an AI opponent, judged at the end), Crossfire (cross-examination practice), Flowchart, Timer, Library (sources for the Current Debate), and History (saved results).",
  "A tool given a motion with no Current Debate asks \"Start a debate with this motion?\". A motion that differs from the Current Debate asks \"This is a different motion\".",
  "The interface language can be English, Spanish or Hungarian. Source titles, citations, user content and model names may stay in their own language. Hungarian abbreviates AI as MI (mesterséges intelligencia), so \"MI-modell\" is Hungarian.",
  "Long values in selects, chips and narrow fields are shortened with an ellipsis (…) on purpose.",
  "This is a local test stack. Google sign-in, Stripe checkout, ElevenLabs voices and Google Docs export are not configured here, so their failures are expected.",
  "The client runs on a Vite dev server, so the first visit to a page can take a few seconds to render.",
  live
    ? "AI answers come from a real model, so their wording varies between runs."
    : "AI answers come from a fake provider: every AI result is canned text containing the marker FAKE-PROVIDER, and it argues about free public transport whatever the motion. That mismatch is expected here and is not a defect.",
].join("\n");

// `system` is read by the acting agent only, never by the judges.
const rules = [
  "Use the visible labels on screen. Verify a visible confirmation before completing a step.",
  "Never delete the account or all data, sign out, or open billing checkout unless the instruction asks for it.",
];

const agent = (persona?: string) => ({
  model,
  context,
  // Free and slow models routinely take longer than e2e's 30 s default per judgment.
  judgmentTimeout: 180_000,
  system: [...rules, ...(persona ? [persona] : [])].join("\n"),
});

export default {
  projectId: "debatelab",
  tests: "agentic/**/*.e2e.ts",
  targets: [
    {
      name: "desktop",
      engine: web({ viewport: { width: 1280, height: 800 } }),
      app: { url: appUrl, identity: "debatelab-verify-stack", environment: "test" },
    },
    {
      // A phone-sized viewport only: e2e 0.15 has no touch or user-agent emulation.
      name: "mobile",
      engine: web({ viewport: { width: 393, height: 851 } }),
      app: { url: appUrl, identity: "debatelab-verify-stack", environment: "test" },
    },
  ],
  // AI steps wait on Edge Functions, and a free model can take minutes per judgment.
  timeout: 600_000,
  // More parallel model calls only trip the free model's upstream rate limit.
  workers: process.env.CI ? 1 : 2,
  // The dev server compiles lazy routes on first visit.
  assertionTimeout: 15_000,
  video: "retain-on-failure",
  reporters: ["list", "markdown"],
  // Recorded agent.act() flows replay with no model call. Committed so every
  // checkout and CI share them; CI reads them and never writes.
  cache: { dir: "agentic/replay" },
  agents: {
    default: agent(),
    // Bug-bash personas for `verify.sh e2e explore --agent <name>`.
    "first-timer": agent("You are a 15-year-old who has never used DebateLab and has a debate tournament next week. Go where a newcomer would go, read what the app tells you, and report anything confusing, broken, or misleading."),
    coach: agent("You are a debate coach checking DebateLab before recommending it to a team. Check that numbers, labels, counts, dates and copy agree across pages, and that saved work shows up where the app says it will."),
    "edge-input": agent("You probe input handling: very long motions, emoji, right-to-left text, leading and trailing spaces, empty fields, double submits, and leaving a page mid-request. Report crashes, lost work, unclear errors, and states you cannot recover from."),
    hungarian: agent("You are a Hungarian student. Switch the interface language to Hungarian in Settings first if it is not already. Report untranslated interface text, mixed-language screens, and text that is cut off or overflows."),
  },
} satisfies E2EConfig;
