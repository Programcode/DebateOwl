import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { openrouter } from "@openrouter/ai-sdk-provider";

// Agentic browser tests (TesterArmy e2e) against the verify-debatelab stack.
// Run them through `.claude/skills/verify-debatelab/bin/verify.sh e2e`, which
// checks the stack, loads its environment and the OpenRouter key, and keeps
// the evidence. See docs/testing.md#agentic-browser-tests.

// Only the `verify.sh up` client: a plain dev server talks to production Supabase.
const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:18081";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(appUrl)) {
  throw new Error(`Agentic tests only drive the local verification stack, not ${appUrl}`);
}

const live = process.env.VERIFY_MODE === "live";

// The testing agent's models, separate from the app's own. Both need tool
// calling and image input. The actor drives agent.act and explorations; its
// recorded flows replay with no model call, so it runs only on a cache miss
// and in explorations. The judge answers every agent.assert, waitFor and
// extract on every run.
// Both run on Claude Haiku pinned to the Anthropic provider with fallbacks off,
// so they bill DebateLab's Anthropic key (BYOK in OpenRouter), never OpenRouter
// credits. Any other family would bill credits, so a non-Claude override fails
// here instead (src/test/ai/anthropic-only-guard.test.ts checks this file).
// `||`, not `??`: an unset Actions variable arrives as an empty string.
const E2E_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
function claudeOnly(id: string) {
  if (!id.startsWith("anthropic/")) {
    throw new Error(`The testing agent runs only on Claude through the Anthropic BYOK key; ${id} would bill OpenRouter credits`);
  }
  return openrouter(id, { provider: { only: ["anthropic"], allow_fallbacks: false } });
}
const model = claudeOnly(process.env.E2E_AGENT_MODEL || E2E_DEFAULT_MODEL);
const judge = claudeOnly(process.env.E2E_JUDGE_MODEL || E2E_DEFAULT_MODEL);

// `context` reaches every model call, judges included: what the app calls things.
const context = [
  "DebateLab is a debate training app for students. A motion is the debate topic, such as \"This House would ban homework\".",
  "Each student works in one Current Debate at a time. The header control reads \"Start debate\" until one exists, then names the motion. Tool pages show a strip \"Working in: <motion>\".",
  "Tools: Generate (a full debate case: thesis, contentions, predicted opponent case, prepared counters), Attack, Brainstorm, Factoids, Ask, Sparring (a practice round against an AI opponent, judged at the end), Crossfire (cross-examination practice), Flowchart, Timer, Library (sources for the Current Debate), and History (saved results).",
  "A tool given a motion with no Current Debate asks \"Start a debate with this motion?\". A motion that differs from the Current Debate asks \"This is a different motion\".",
  "The interface language can be English, Spanish or Hungarian. Source titles, citations, user content and model names may stay in their own language. Hungarian abbreviates AI as MI (mesterséges intelligencia), so \"MI-modell\" is Hungarian, and English loanwords such as coaching are Hungarian there too, inflected (\"coachingot\") or as a modifier (\"coaching funkciók\"). The Spanish interface deliberately keeps the loanwords coach, coaching and sparring (\"Pregunta a tu coach\", \"Para Coaches\", \"Rondas de sparring\"); they are Spanish there.",
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

// The judge only judges; the actor drives agent.act and explorations.
const agent = (persona?: string) => ({
  model,
  judge,
  context,
  // Generous for slow providers; e2e's default is 30 s per judgment.
  judgmentTimeout: 120_000,
  system: [...rules, ...(persona ? [persona] : [])].join("\n"),
});

// Records page errors, console.error and Supabase 5xx answers in every
// document; the student fixture fails the test on them.
const initScripts = [{ path: "agentic/support/capture-errors.js" }];

export default {
  projectId: "debatelab",
  tests: "agentic/**/*.e2e.ts",
  targets: [
    {
      name: "desktop",
      engine: web({ viewport: { width: 1280, height: 800 }, initScripts }),
      app: { url: appUrl, identity: "debatelab-verify-stack", environment: "test" },
    },
    {
      // A phone-sized viewport without touch emulation, which e2e does not
      // offer. The app lays out by viewport width and never reads the user
      // agent; the Playwright Pixel 5 project covers touch.
      name: "mobile",
      engine: web({ viewport: { width: 393, height: 851 }, initScripts }),
      app: { url: appUrl, identity: "debatelab-verify-stack", environment: "test" },
    },
  ],
  // AI steps wait on Edge Functions, and a judgment can take a minute.
  timeout: 600_000,
  // Judgments dominate the run time, and replayed steps call no model, so
  // three workers keep the page sweep short.
  workers: 3,
  // A test that skips after a failed soft assertion or attempt is a failure.
  failOnSkippedFailure: true,
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
