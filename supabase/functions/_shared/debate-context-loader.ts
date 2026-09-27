// Loads the Current Debate material a request asked for, using the service
// role. The service role bypasses RLS, so every query here filters by the
// caller's user ID and by the one requested debate: an ID from another user
// or another debate simply never loads.

import {
  boundOutputDigests,
  type DebateContextOutputKind,
  type DebateContextRequest,
  type DebateContextSide,
  type DebateOutputDigest,
  type DebateOutputRef,
  digestOutput,
} from "./debate-context.ts";
import type { DebatePromptContext } from "./prompts/context.ts";

type QueryResult = { data: unknown; error: { message?: string } | null };
type Query = PromiseLike<QueryResult>;
type QueryBuilder = Query & {
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): Query;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
};
export type DebateContextDatabase = { from(table: string): { select(columns: string): QueryBuilder } };

export interface DebateSettingsContext {
  format?: string;
  role?: string;
  judge?: string;
}

export interface DebateContextSource {
  id: string;
  title: string;
  content: string;
  origin?: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface LoadedDebateContext {
  debateId: string;
  motion: string;
  side: DebateContextSide;
  settings: DebateSettingsContext;
  instructions: string;
  /** Requested sources that belong to this debate, in request order. */
  sources: DebateContextSource[];
  /** Saved results that fit the budget, in request order. */
  outputs: DebateOutputDigest[];
  outputsOmittedForSize: DebateOutputRef[];
  /** Requested IDs that were not found in this debate for this user. */
  sourcesUnavailable: number;
  outputsUnavailable: number;
}

/** The debate does not exist or does not belong to the caller. */
export class DebateContextNotFoundError extends Error {
  constructor() {
    super("Debate not found");
    this.name = "DebateContextNotFoundError";
  }
}

const RESULT_TABLES: Partial<Record<DebateContextOutputKind, string>> = {
  case: "cases",
  attack: "attacks",
  brainstorm: "brainstorms",
  factoids: "factoids",
  crossfire: "crossfires",
};

const EMPTY: Query = Promise.resolve({ data: [], error: null });
const SETTINGS_KEYS = ["format", "role", "judge"] as const;
const MAX_CHAT_MESSAGES = 6;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rows(result: QueryResult): Record<string, unknown>[] {
  return Array.isArray(result.data) ? result.data.map(record).filter(Boolean) as Record<string, unknown>[] : [];
}

function side(value: unknown): DebateContextSide | null {
  return value === "pro" || value === "con" || value === "both" || value === "neutral" ? value : null;
}

function parseSettings(value: unknown): DebateSettingsContext {
  const input = record(value) ?? {};
  const settings: DebateSettingsContext = {};
  for (const key of SETTINGS_KEYS) {
    if (typeof input[key] === "string" && input[key]) settings[key] = String(input[key]).slice(0, 200);
  }
  return settings;
}

function failIfError(results: QueryResult[]): void {
  if (results.some((result) => result.error)) throw new Error("Debate context unavailable");
}

export async function loadDebateContext(
  database: DebateContextDatabase,
  userId: string,
  request: DebateContextRequest,
): Promise<LoadedDebateContext> {
  const inDebate = (table: string, columns: string, ids: string[]) => ids.length === 0
    ? EMPTY
    : database.from(table).select(columns).eq("user_id", userId).eq("debate_id", request.debateId).in("id", ids);
  const idsOf = (kind: DebateContextOutputKind) => request.outputs.filter((ref) => ref.kind === kind).map((ref) => ref.id);

  const resultKinds = Object.keys(RESULT_TABLES) as DebateContextOutputKind[];
  const [debate, sources, chats, sparring, ...results] = await Promise.all([
    database.from("debates").select("id,motion,settings,instructions").eq("id", request.debateId).eq("user_id", userId).maybeSingle(),
    inDebate("sources", "id,title,content,origin,type,metadata", request.sourceIds),
    inDebate("chats", "id,title,side", idsOf("chat")),
    inDebate("sparring_sessions", "id,motion,user_side,final_evaluation,side", idsOf("sparring")),
    ...resultKinds.map((kind) => inDebate(RESULT_TABLES[kind]!, "id,title,output,side", idsOf(kind))),
  ]);
  failIfError([debate, sources, chats, sparring, ...results]);
  const debateRow = record(debate.data);
  if (!debateRow || debateRow.id !== request.debateId) throw new DebateContextNotFoundError();

  // Chat text lives in messages, which have no owner column. Only chats that
  // already passed the owner and debate filters above are read.
  const chatRows = rows(chats);
  const messageResults = await Promise.all(chatRows.map((chat) =>
    database.from("messages").select("role,content").eq("chat_id", String(chat.id))
      .order("created_at", { ascending: false }).limit(MAX_CHAT_MESSAGES)));
  failIfError(messageResults);

  const found = new Map<string, { title: string; side: DebateContextSide | null; data: unknown }>();
  resultKinds.forEach((kind, index) => {
    for (const row of rows(results[index])) {
      found.set(`${kind}:${row.id}`, { title: String(row.title ?? ""), side: side(row.side), data: row.output });
    }
  });
  chatRows.forEach((chat, index) => {
    found.set(`chat:${chat.id}`, { title: String(chat.title ?? ""), side: side(chat.side), data: rows(messageResults[index]).reverse() });
  });
  for (const row of rows(sparring)) {
    found.set(`sparring:${row.id}`, {
      title: String(row.motion ?? ""),
      side: side(row.side) ?? side(row.user_side),
      data: { userSide: row.user_side, scorecard: row.final_evaluation },
    });
  }

  const digests: DebateOutputDigest[] = request.outputs.flatMap((ref) => {
    const item = found.get(`${ref.kind}:${ref.id}`);
    return item ? [{ ...ref, title: item.title.slice(0, 200), side: item.side, digest: digestOutput(ref.kind, item.data) }] : [];
  });
  const bounded = boundOutputDigests(digests);

  const sourceById = new Map(rows(sources).map((row) => [String(row.id), row]));
  const orderedSources = request.sourceIds.flatMap((id): DebateContextSource[] => {
    const row = sourceById.get(id);
    if (!row || typeof row.title !== "string" || !row.title.trim() || typeof row.content !== "string" || !row.content || typeof row.type !== "string" || !row.type.trim()) return [];
    return [{
      id,
      title: row.title,
      content: row.content,
      type: row.type,
      ...(typeof row.origin === "string" && row.origin ? { origin: row.origin } : {}),
      ...(record(row.metadata) ? { metadata: record(row.metadata)! } : {}),
    }];
  });

  return {
    debateId: request.debateId,
    motion: String(debateRow.motion ?? "").slice(0, 1200),
    side: request.side,
    settings: parseSettings(debateRow.settings),
    instructions: typeof debateRow.instructions === "string" ? debateRow.instructions.slice(0, 2000) : "",
    sources: orderedSources,
    outputs: bounded.included,
    outputsOmittedForSize: bounded.omittedForSize.map(({ kind, id }) => ({ kind, id })),
    sourcesUnavailable: request.sourceIds.length - orderedSources.length,
    outputsUnavailable: request.outputs.length - digests.length + bounded.empty.length,
  };
}

type PromptFeature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring" | "crossfire";

/**
 * What of the loaded debate each feature may put in its prompt.
 * - Sparring stays transcript-only: motion, side, and settings. Instructions
 *   shape an opponent's speech but never a persisted scorecard.
 * - Crossfire keeps its non-overridable transcript rules, so free-form
 *   instructions stay out; saved results may inform its questions.
 * - Every other feature receives the whole selection.
 */
export function debatePromptContextFor(
  loaded: LoadedDebateContext | null,
  feature: PromptFeature,
  sparringAction?: "respond" | "score",
): DebatePromptContext | null {
  if (!loaded) return null;
  const base = { motion: loaded.motion, side: loaded.side, settings: loaded.settings };
  const outputs = loaded.outputs.map(({ kind, side, title, digest }) => ({ kind, side, title, digest }));
  if (feature === "sparring") {
    return sparringAction === "score" ? { ...base, outputs: [] } : { ...base, instructions: loaded.instructions, outputs: [] };
  }
  if (feature === "crossfire") return { ...base, outputs };
  return { ...base, instructions: loaded.instructions, outputs };
}

/**
 * Honest counts for the browser: what reached the prompt and what did not.
 * `sourcesUsed` is counted after relevance ranking, so a source set aside
 * as irrelevant is never reported as used.
 */
export function debateContextMeta(
  loaded: LoadedDebateContext,
  feature: PromptFeature,
  sourcesUsed: number,
  sourceCounts: { omittedForSize: number; shortened: number },
  sparringAction?: "respond" | "score",
) {
  const prompt = debatePromptContextFor(loaded, feature, sparringAction);
  const outputsUsed = prompt?.outputs.length ? loaded.outputs.map(({ kind, id }) => ({ kind, id })) : [];
  return {
    debateId: loaded.debateId,
    sourcesUsed,
    sourcesOmittedForSize: sourceCounts.omittedForSize,
    sourcesShortened: sourceCounts.shortened,
    sourcesUnavailable: loaded.sourcesUnavailable,
    outputsUsed,
    outputsOmittedForSize: prompt?.outputs.length ? loaded.outputsOmittedForSize : [],
    outputsUnavailable: loaded.outputsUnavailable,
    instructionsUsed: Boolean(prompt?.instructions?.trim()),
  };
}
