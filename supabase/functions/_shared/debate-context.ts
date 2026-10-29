// Current Debate context rules shared by the browser and the ai Edge Functions.
//
// The browser previews what a request will use and sends only IDs and
// preferences. The server loads the real text for those IDs, checks that each
// one belongs to the caller and to the same debate, and applies the same size
// budget. Keeping selection, digests, and budgets in this one pure module
// (no Deno or DOM APIs, no prompt text) means the preview and the prompt agree.

export const DEBATE_CONTEXT_OUTPUT_KINDS = [
  "case",
  "attack",
  "brainstorm",
  "factoids",
  "chat",
  "crossfire",
  "sparring",
] as const;
export type DebateContextOutputKind = typeof DEBATE_CONTEXT_OUTPUT_KINDS[number];

export type DebateContextFeature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring" | "crossfire";
export type DebateContextSide = "pro" | "con" | "both" | "neutral";

export interface DebateOutputRef {
  kind: DebateContextOutputKind;
  id: string;
}

export interface DebateContextRequest {
  debateId: string;
  side: DebateContextSide;
  /** Library sources in this debate, in the order the request should use them. */
  sourceIds: string[];
  /** Saved results in this debate the request should read. */
  outputs: DebateOutputRef[];
}

/** Sources per request; matches the prompt's source-count bound. */
export const MAX_CONTEXT_SOURCES = 10;
/** Saved results per request, pinned ones included. */
export const MAX_CONTEXT_OUTPUTS = 6;
/** Saved results chosen automatically when nothing is pinned. */
export const MAX_AUTO_OUTPUTS = 3;
/** Automatic picks per result type, so one busy tool cannot crowd out the rest. */
export const MAX_AUTO_OUTPUTS_PER_KIND = 2;
export const MAX_PINNED_OUTPUTS = 3;
/** Characters one saved result may contribute. */
export const MAX_OUTPUT_DIGEST_CHARS = 2_500;
/**
 * Characters one saved case may contribute. A case is read out in the round,
 * so its R2 "backing up" paragraphs, "If they say" answers and Conclusor
 * reasons reach the prompt in full: an R2 with 6-8 answers runs ~10,000.
 */
export const MAX_CASE_DIGEST_CHARS = 12_000;
/** Characters kept from one of those spoken paragraphs; a safety bound, not a summary length. */
export const MAX_CASE_PARAGRAPH_CHARS = 2_000;
/** "If they say" answers kept from one case; R2 writes at most 8. */
export const MAX_CASE_COUNTERS = 8;
/** Characters all saved results together may contribute. */
export const MAX_OUTPUTS_TOTAL_CHARS = 16_000;

/**
 * Saved results that help each feature, in order of usefulness. Results of
 * other types are used only when the student pins them.
 */
export const RELEVANT_OUTPUT_KINDS: Record<DebateContextFeature, readonly DebateContextOutputKind[]> = {
  generate: ["case", "brainstorm", "factoids", "attack"],
  attack: ["case", "factoids", "brainstorm"],
  brainstorm: ["brainstorm", "case", "factoids"],
  factoids: ["case", "brainstorm", "factoids"],
  ask: ["case", "attack", "brainstorm", "factoids", "crossfire", "sparring"],
  crossfire: ["case", "attack", "factoids"],
  sparring: ["case", "brainstorm", "factoids"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIDES = new Set<DebateContextSide>(["pro", "con", "both", "neutral"]);
const KINDS = new Set<string>(DEBATE_CONTEXT_OUTPUT_KINDS);

export function isDebateContextOutputKind(value: unknown): value is DebateContextOutputKind {
  return typeof value === "string" && KINDS.has(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** The side a request prepares, derived from the feature's own controls. */
export function requestSide(feature: DebateContextFeature, input: Record<string, unknown>): DebateContextSide {
  if (feature === "generate" || feature === "brainstorm") {
    return input.side === "pro" || input.side === "con" ? input.side : "both";
  }
  if (feature === "factoids") return input.direction === "against" ? "con" : "pro";
  if (feature === "sparring") return input.userSide === "con" ? "con" : input.userSide === "pro" ? "pro" : "both";
  return "both";
}

/** A result recorded for one side helps only that side; everything else helps both. */
export function sideMatches(requested: DebateContextSide, itemSide: DebateContextSide | null | undefined): boolean {
  if (requested !== "pro" && requested !== "con") return true;
  return itemSide !== (requested === "pro" ? "con" : "pro");
}

export interface DebateOutputCandidate extends DebateOutputRef {
  side: DebateContextSide | null;
  createdAt: number;
  pinned: boolean;
}

/**
 * The default saved results for a request: pinned results first, then the
 * newest results of the types this feature uses, for the requested side.
 */
export function selectDefaultOutputs(
  candidates: readonly DebateOutputCandidate[],
  feature: DebateContextFeature,
  side: DebateContextSide,
): DebateOutputRef[] {
  const newest = [...candidates].sort((a, b) => b.createdAt - a.createdAt);
  const pinned = newest.filter((item) => item.pinned).slice(0, MAX_PINNED_OUTPUTS);
  const relevant = new Set(RELEVANT_OUTPUT_KINDS[feature]);
  const perKind = new Map<DebateContextOutputKind, number>();
  const automatic: DebateOutputCandidate[] = [];
  for (const item of newest) {
    if (automatic.length >= MAX_AUTO_OUTPUTS) break;
    if (item.pinned || !relevant.has(item.kind) || !sideMatches(side, item.side)) continue;
    const count = perKind.get(item.kind) ?? 0;
    if (count >= MAX_AUTO_OUTPUTS_PER_KIND) continue;
    perKind.set(item.kind, count + 1);
    automatic.push(item);
  }
  return [...pinned, ...automatic].map(({ kind, id }) => ({ kind, id }));
}

/** Validates the browser's context request. IDs only; no text is accepted. */
export function parseDebateContextRequest(value: unknown): { value: DebateContextRequest } | { error: string } {
  const input = record(value);
  if (!input) return { error: "debateContext must be an object" };
  const allowed = new Set(["debateId", "side", "sourceIds", "outputs"]);
  if (!Object.keys(input).every((key) => allowed.has(key))) return { error: "debateContext contains unsupported fields" };
  if (typeof input.debateId !== "string" || !UUID.test(input.debateId)) return { error: "debateContext.debateId must be a UUID" };
  if (typeof input.side !== "string" || !SIDES.has(input.side as DebateContextSide)) return { error: "debateContext.side is invalid" };
  const sourceIds = input.sourceIds ?? [];
  if (!Array.isArray(sourceIds) || sourceIds.length > MAX_CONTEXT_SOURCES) {
    return { error: `debateContext.sourceIds must contain at most ${MAX_CONTEXT_SOURCES} items` };
  }
  if (!sourceIds.every((id): id is string => typeof id === "string" && UUID.test(id))) {
    return { error: "debateContext.sourceIds must contain valid UUIDs" };
  }
  if (new Set(sourceIds).size !== sourceIds.length) return { error: "debateContext.sourceIds must not contain duplicates" };
  const outputs = input.outputs ?? [];
  if (!Array.isArray(outputs) || outputs.length > MAX_CONTEXT_OUTPUTS) {
    return { error: `debateContext.outputs must contain at most ${MAX_CONTEXT_OUTPUTS} items` };
  }
  const refs: DebateOutputRef[] = [];
  const seen = new Set<string>();
  for (const item of outputs) {
    const ref = record(item);
    if (!ref || Object.keys(ref).some((key) => key !== "kind" && key !== "id")) return { error: "debateContext.outputs contains an invalid item" };
    if (!isDebateContextOutputKind(ref.kind) || typeof ref.id !== "string" || !UUID.test(ref.id)) {
      return { error: "debateContext.outputs contains an invalid item" };
    }
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return { error: "debateContext.outputs must not contain duplicates" };
    seen.add(key);
    refs.push({ kind: ref.kind, id: ref.id });
  }
  return { value: { debateId: input.debateId, side: input.side as DebateContextSide, sourceIds, outputs: refs } };
}

// ---------- Digests: a compact, deterministic text view of a saved result ----------

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function lines(entries: Array<string | false | null | undefined>): string {
  return entries.filter((entry): entry is string => Boolean(entry && entry.trim())).join("\n");
}

function digestCase(data: Record<string, unknown>): string {
  const structure = record(data.caseStructure) ?? {};
  const contentions = list(data.contentions).map(record).filter(Boolean) as Record<string, unknown>[];
  const counters = list(data.counters).map(record).filter(Boolean) as Record<string, unknown>[];
  return lines([
    text(structure.thesis, 300) && `Thesis: ${text(structure.thesis, 300)}`,
    text(structure.framework, 240) && `How to judge this debate: ${text(structure.framework, 240)}`,
    ...contentions.slice(0, 4).map((item, index) => lines([
      `Argument ${index + 1}: ${text(item.title, 80) ? `${text(item.title, 80)}. ` : ""}${text(item.claim, 200)}`,
      text(item.reasoning, 320) && `  Explanation: ${text(item.reasoning, 320)}`,
      text(item.impact, 240) && `  Why it matters: ${text(item.impact, 240)}`,
    ])),
    ...list(data.reinforce).map(record).filter(Boolean).slice(0, 3).map((item) =>
      text(item!.text, MAX_CASE_PARAGRAPH_CHARS) && `Backing up ${text(item!.argument, 200) || "an argument"}: ${text(item!.text, MAX_CASE_PARAGRAPH_CHARS)}`),
    ...list(data.whyWeWin).slice(0, 3).map((item) => text(item, MAX_CASE_PARAGRAPH_CHARS) && `Why we win: ${text(item, MAX_CASE_PARAGRAPH_CHARS)}`),
    ...counters.slice(0, MAX_CASE_COUNTERS).map((item) => `If they say "${text(item.targetArgument, 200)}", we answer: ${text(item.counterpoint, MAX_CASE_PARAGRAPH_CHARS)}`),
  ]);
}

function digestAttack(data: Record<string, unknown>): string {
  const assessment = record(data.overallAssessment) ?? {};
  const weaknesses = list(data.weaknesses).map(record).filter(Boolean) as Record<string, unknown>[];
  return lines([
    text(assessment.summary, 300) && `Assessment: ${text(assessment.summary, 300)}`,
    ...weaknesses.slice(0, 5).map((item) => lines([
      `Weakness (${text(item.severity, 20) || "unrated"}): ${text(item.description, 240)}`,
      text(item.howOpponentAttacks, 240) && `  Response: ${text(item.howOpponentAttacks, 240)}`,
    ])),
  ]);
}

function brainstormIdeas(data: Record<string, unknown>): Record<string, unknown>[] {
  const ideas: unknown[] = [
    ...list(data.topFive).map((item) => record(item)?.idea),
    ...list(data.mindmap).flatMap((item) => list(record(item)?.items)),
    ...list(data.buckets).flatMap((item) => list(record(item)?.ideas)),
  ];
  return ideas.map(record).filter(Boolean) as Record<string, unknown>[];
}

function digestBrainstorm(data: Record<string, unknown>): string {
  return lines(brainstormIdeas(data).slice(0, 6).map((idea) =>
    `Idea (${text(idea.side, 12) || "either side"}): ${text(idea.title, 140)}. ${text(idea.description, 260)}`));
}

function digestFactoids(data: Record<string, unknown>): string {
  const factoids = list(data.factoids).map(record).filter(Boolean) as Record<string, unknown>[];
  return lines(factoids.slice(0, 6).map((item) => {
    const citation = record(item.citation) ?? {};
    const source = [text(citation.publisher, 80), text(citation.date, 40), text(citation.url, 200)].filter(Boolean).join(", ");
    return lines([
      `Evidence: ${text(item.shortClaim, 220)}${text(item.keyFigure, 120) ? ` (${text(item.keyFigure, 120)})` : ""}`,
      source && `  Source: ${source}`,
      text(item.limitations, 160) && `  Limits: ${text(item.limitations, 160)}`,
    ]);
  }));
}

function digestChat(data: unknown): string {
  const messages = list(data).map(record).filter(Boolean) as Record<string, unknown>[];
  return lines(messages.slice(-6).map((message) =>
    `${message.role === "assistant" ? "Coach" : "Student"}: ${text(message.content, 400)}`));
}

function digestCrossfire(data: Record<string, unknown>): string {
  const debrief = record(data.debrief) ?? {};
  const claims = (key: string, label: string) => list(debrief[key]).slice(0, 3).map((item) => {
    const entry = record(item) ?? {};
    return `${label}: ${text(entry.claim ?? entry.question, 200)}`;
  });
  const strongest = record(debrief.strongestExchange);
  return lines([
    ...claims("concessionsSecured", "Concession secured"),
    ...claims("evasiveOrIncompleteAnswers", "Evasive or incomplete answer"),
    ...claims("missedFollowUps", "Missed follow-up"),
    strongest && `Strongest exchange: ${text(strongest.claim, 200)}`,
  ]);
}

function digestSparring(data: Record<string, unknown>): string {
  const scorecard = record(data.scorecard) ?? {};
  return lines([
    text(data.userSide, 8) && `Student side: ${text(data.userSide, 8)}`,
    text(scorecard.verdict, 300) && `Verdict: ${text(scorecard.verdict, 300)}`,
    ...list(scorecard.improvementAreas).slice(0, 4).map((item) => `Work on: ${text(item, 200)}`),
    ...list(scorecard.keyMoments).slice(0, 3).map((item) => `Key moment: ${text(item, 200)}`),
  ]);
}

/**
 * A bounded plain-text view of one saved result. The browser and the server
 * pass the same stored JSON, so both count the same characters.
 * For sparring, pass `{ userSide, scorecard }`; for chat, the message array.
 */
export function digestOutput(kind: DebateContextOutputKind, data: unknown): string {
  const value = record(data) ?? {};
  const digest = kind === "case" ? digestCase(value)
    : kind === "attack" ? digestAttack(value)
    : kind === "brainstorm" ? digestBrainstorm(value)
    : kind === "factoids" ? digestFactoids(value)
    : kind === "chat" ? digestChat(data)
    : kind === "crossfire" ? digestCrossfire(value)
    : digestSparring(value);
  const max = kind === "case" ? MAX_CASE_DIGEST_CHARS : MAX_OUTPUT_DIGEST_CHARS;
  return digest.length > max ? `${digest.slice(0, max - 1)}…` : digest;
}

export interface DebateOutputDigest extends DebateOutputRef {
  title: string;
  side: DebateContextSide | null;
  digest: string;
}

/**
 * Keeps whole saved results, in request order, until the total budget is
 * spent. Results that would overflow are left out entirely, never cut, and
 * results with nothing usable yet (an unjudged round, an empty chat) are
 * reported separately.
 */
export function boundOutputDigests<T extends { digest: string }>(items: readonly T[]): { included: T[]; omittedForSize: T[]; empty: T[] } {
  const included: T[] = [];
  const omittedForSize: T[] = [];
  const empty: T[] = [];
  let remaining = MAX_OUTPUTS_TOTAL_CHARS;
  for (const item of items) {
    if (!item.digest.trim()) {
      empty.push(item);
    } else if (item.digest.length > remaining) {
      omittedForSize.push(item);
    } else {
      remaining -= item.digest.length;
      included.push(item);
    }
  }
  return { included, omittedForSize, empty };
}
