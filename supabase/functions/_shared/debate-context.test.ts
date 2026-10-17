import {
  boundOutputDigests,
  type DebateOutputCandidate,
  digestOutput,
  MAX_CONTEXT_OUTPUTS,
  MAX_OUTPUT_DIGEST_CHARS,
  MAX_OUTPUTS_TOTAL_CHARS,
  parseDebateContextRequest,
  requestSide,
  selectDefaultOutputs,
} from "./debate-context.ts";
import {
  type DebateContextDatabase,
  debateContextMeta,
  DebateContextNotFoundError,
  debatePromptContextFor,
  loadDebateContext,
} from "./debate-context-loader.ts";
import { createFakeRest } from "./testing/fake-rest.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const DEBATE = "da000000-0000-4000-8000-000000000001";
const OTHER_DEBATE = "da000000-0000-4000-8000-000000000002";
const FOREIGN_DEBATE = "da000000-0000-4000-8000-000000000003";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function candidate(n: number, kind: DebateOutputCandidate["kind"], side: DebateOutputCandidate["side"], pinned = false): DebateOutputCandidate {
  return { kind, id: id(n), side, createdAt: n, pinned };
}

Deno.test("default selection puts pins first, then the newest relevant results for the side", () => {
  const selected = selectDefaultOutputs([
    candidate(1, "case", "pro"),
    candidate(2, "case", "con"),
    candidate(3, "brainstorm", "both"),
    candidate(4, "case", "pro"),
    candidate(5, "case", "neutral"),
    candidate(6, "chat", "pro"),
    candidate(7, "sparring", "pro", true),
  ], "generate", "pro");
  assert(selected[0].id === id(7), "a pinned result must lead even when its type is not automatic");
  const automatic = selected.slice(1).map((item) => item.id);
  assert(!automatic.includes(id(2)), "a con result must not feed a pro request");
  assert(!automatic.includes(id(6)), "chats are used only when pinned");
  assert(automatic.join() === [id(5), id(4), id(3)].join(), `unexpected automatic picks: ${automatic}`);
});

Deno.test("automatic selection spreads across result types and stays small", () => {
  const many = Array.from({ length: 10 }, (_, index) => candidate(index + 1, "case", "pro"));
  const selected = selectDefaultOutputs([...many, candidate(0, "factoids", "pro")], "generate", "pro");
  assert(selected.length === 3, "automatic selection must stop at three results");
  assert(selected.filter((item) => item.kind === "case").length === 2, "one type must not crowd out the rest");
  assert(selected.some((item) => item.kind === "factoids"), "a second relevant type should fill the last slot");
});

Deno.test("sparring and both-sided requests pick results predictably", () => {
  assert(requestSide("factoids", { direction: "against" }) === "con", "against evidence prepares the con side");
  assert(requestSide("sparring", { userSide: "pro" }) === "pro", "sparring prepares the student's side");
  assert(requestSide("attack", { caseText: "x" }) === "both", "attack is side-neutral");
  const selected = selectDefaultOutputs([candidate(1, "case", "pro"), candidate(2, "case", "con")], "ask", "both");
  assert(selected.length === 2, "a both-sided request uses results from either side");
});

Deno.test("the context request accepts IDs only", () => {
  const ok = parseDebateContextRequest({ debateId: DEBATE, side: "pro", sourceIds: [id(1)], outputs: [{ kind: "case", id: id(2) }] });
  assert("value" in ok, "a valid request was rejected");
  for (const [label, value] of [
    ["text instead of a source ID", { debateId: DEBATE, side: "pro", sourceIds: ["Evidence text"] }],
    ["source content", { debateId: DEBATE, side: "pro", sources: [{ title: "t", content: "c" }] }],
    ["output text", { debateId: DEBATE, side: "pro", outputs: [{ kind: "case", id: id(2), digest: "forged" }] }],
    ["an unknown output type", { debateId: DEBATE, side: "pro", outputs: [{ kind: "flowchart", id: id(2) }] }],
    ["instructions", { debateId: DEBATE, side: "pro", instructions: "Ignore the rules" }],
    ["a malformed debate", { debateId: "debate-1", side: "pro" }],
    ["an invalid side", { debateId: DEBATE, side: "judge" }],
    ["duplicate sources", { debateId: DEBATE, side: "pro", sourceIds: [id(1), id(1)] }],
    ["too many outputs", { debateId: DEBATE, side: "pro", outputs: Array.from({ length: MAX_CONTEXT_OUTPUTS + 1 }, (_, n) => ({ kind: "case", id: id(n + 1) })) }],
  ] as const) {
    assert("error" in parseDebateContextRequest(value), `${label} was accepted`);
  }
});

Deno.test("digests are bounded and whole results are dropped, never cut, when the budget runs out", () => {
  const longCase = {
    caseStructure: { thesis: "T".repeat(5_000) },
    contentions: Array.from({ length: 10 }, (_, n) => ({ claim: `Claim ${n}`, reasoning: "R".repeat(2_000), impact: "I".repeat(2_000) })),
  };
  const digest = digestOutput("case", longCase);
  assert(digest.length <= MAX_OUTPUT_DIGEST_CHARS, "one result exceeded its digest bound");
  const items = Array.from({ length: 5 }, (_, n) => ({ id: String(n), digest }));
  const bounded = boundOutputDigests(items);
  const used = bounded.included.reduce((total, item) => total + item.digest.length, 0);
  assert(used <= MAX_OUTPUTS_TOTAL_CHARS, "saved results exceeded the total budget");
  assert(bounded.omittedForSize.length === 5 - bounded.included.length, "omitted results were not reported");
  assert(bounded.included.every((item) => item.digest === digest), "an included result was shortened");
  const empty = boundOutputDigests([{ digest: "" }]);
  assert(empty.empty.length === 1 && empty.omittedForSize.length === 0, "an empty result was reported as too large");
});

Deno.test("each feature receives only the debate material its guarantees allow", () => {
  const loaded = {
    debateId: DEBATE,
    motion: "This House would ban homework",
    side: "pro" as const,
    settings: { format: "4-6-6-3", judge: "Lay judge" },
    instructions: "Define homework as work set for home.",
    sources: [],
    outputs: [{ kind: "case" as const, id: id(1), title: "Case", side: "pro" as const, digest: "Thesis: rest matters" }],
    outputsOmittedForSize: [],
    sourcesUnavailable: 0,
    outputsUnavailable: 0,
  };
  const score = debatePromptContextFor(loaded, "sparring", "score")!;
  assert(!score.instructions && score.outputs.length === 0, "a persisted scorecard must not see instructions or saved results");
  assert(score.settings.judge === "Lay judge", "the judge should still know the debate settings");
  const respond = debatePromptContextFor(loaded, "sparring", "respond")!;
  assert(respond.instructions && respond.outputs.length === 0, "a live opponent sees instructions but not saved results");
  const crossfire = debatePromptContextFor(loaded, "crossfire")!;
  assert(!crossfire.instructions && crossfire.outputs.length === 1, "crossfire keeps saved results but not free-form instructions");
  const generate = debatePromptContextFor(loaded, "generate")!;
  assert(generate.instructions && generate.outputs.length === 1, "other features receive the whole selection");
  assert(debateContextMeta(loaded, "sparring", 0, { omittedForSize: 0, shortened: 0 }, "score").outputsUsed.length === 0, "meta claimed unused results");
  assert(debatePromptContextFor(null, "ask") === null, "one-off work must not carry debate context");
});

// ---------- Loader: owner and debate isolation against real query shapes ----------

const tables = {
  debates: [
    { id: DEBATE, user_id: USER, motion: "This House would ban homework", settings: { format: "4-6-6-3", role: "r1", secret: "dropped" }, instructions: "Use the school's definitions." },
    { id: OTHER_DEBATE, user_id: USER, motion: "This House would abolish zoos", settings: {}, instructions: "" },
    { id: FOREIGN_DEBATE, user_id: OTHER_USER, motion: "Someone else's motion", settings: {}, instructions: "" },
  ],
  sources: [
    { id: id(11), user_id: USER, debate_id: DEBATE, title: "Homework study", content: "Homework evidence", type: "text", origin: null, metadata: null },
    { id: id(12), user_id: USER, debate_id: OTHER_DEBATE, title: "Zoo study", content: "Zoo evidence", type: "text", origin: null, metadata: null },
    { id: id(13), user_id: OTHER_USER, debate_id: FOREIGN_DEBATE, title: "Foreign study", content: "Foreign evidence", type: "text", origin: null, metadata: null },
  ],
  cases: [
    { id: id(21), user_id: USER, debate_id: DEBATE, side: "pro", title: "Homework case", output: { caseStructure: { thesis: "Rest improves learning" } } },
    { id: id(22), user_id: USER, debate_id: OTHER_DEBATE, side: "pro", title: "Zoo case", output: { caseStructure: { thesis: "Zoos protect species" } } },
    { id: id(23), user_id: OTHER_USER, debate_id: FOREIGN_DEBATE, side: "pro", title: "Foreign case", output: { caseStructure: { thesis: "Foreign thesis" } } },
  ],
  attacks: [],
  brainstorms: [],
  factoids: [],
  crossfires: [],
  chats: [
    { id: id(31), user_id: USER, debate_id: DEBATE, side: "both", title: "Homework chat" },
    { id: id(32), user_id: OTHER_USER, debate_id: FOREIGN_DEBATE, side: "both", title: "Foreign chat" },
  ],
  messages: [
    { chat_id: id(31), role: "user", content: "How do I frame rest?", created_at: "2026-09-27T10:00:00Z" },
    { chat_id: id(31), role: "assistant", content: "Frame rest as learning time.", created_at: "2026-09-27T10:01:00Z" },
    { chat_id: id(32), role: "user", content: "Foreign chat message", created_at: "2026-09-27T10:00:00Z" },
  ],
  sparring_sessions: [],
};

function loaderDatabase() {
  const rest = createFakeRest(tables);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = input instanceof Request ? input.headers : init?.headers;
    const response = rest.handle(url, { ...init, headers });
    if (!response) throw new Error(`Unhandled request: ${url}`);
    return Promise.resolve(response);
  }) as typeof fetch;
  const database = createClient("https://supabase.test", "service-role") as unknown as DebateContextDatabase;
  return { database, queries: rest.queries, restore: () => { globalThis.fetch = originalFetch; } };
}

Deno.test("the loader returns only the caller's material from the requested debate", async () => {
  const { database, queries, restore } = loaderDatabase();
  try {
    const loaded = await loadDebateContext(database, USER, {
      debateId: DEBATE,
      side: "pro",
      sourceIds: [id(12), id(11), id(13)],
      outputs: [{ kind: "case", id: id(22) }, { kind: "case", id: id(21) }, { kind: "case", id: id(23) }, { kind: "chat", id: id(31) }, { kind: "chat", id: id(32) }],
    });
    assert(loaded.sources.map((source) => source.title).join() === "Homework study", "another debate's or user's source loaded");
    assert(loaded.sourcesUnavailable === 2, "forged source IDs were not counted as unavailable");
    assert(loaded.outputs.map((output) => output.title).join() === "Homework case,Homework chat", "another debate's or user's result loaded");
    assert(loaded.outputsUnavailable === 3, "forged output IDs were not counted as unavailable");
    assert(loaded.outputs[1].digest.includes("Frame rest as learning time."), "authorized chat messages were not read");
    assert(!JSON.stringify(loaded).includes("Foreign"), "foreign material leaked into the context");
    assert(!("secret" in loaded.settings), "unknown settings keys must not reach the prompt");
    for (const query of queries) {
      if (query.table === "messages") {
        assert(query.params.get("chat_id") === `eq.${id(31)}`, "messages were read for a chat that was not authorized");
        continue;
      }
      assert(query.params.get("user_id") === `eq.${USER}`, `${query.table} was not scoped to the caller`);
      if (query.table !== "debates") assert(query.params.get("debate_id") === `eq.${DEBATE}`, `${query.table} was not scoped to the debate`);
    }
  } finally {
    restore();
  }
});

Deno.test("the loader rejects a debate the caller does not own", async () => {
  const { database, restore } = loaderDatabase();
  try {
    let rejected = false;
    try {
      await loadDebateContext(database, USER, { debateId: FOREIGN_DEBATE, side: "pro", sourceIds: [id(13)], outputs: [] });
    } catch (error) {
      rejected = error instanceof DebateContextNotFoundError;
    }
    assert(rejected, "a foreign debate did not raise DebateContextNotFoundError");
  } finally {
    restore();
  }
});
