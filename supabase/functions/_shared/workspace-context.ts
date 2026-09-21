type QueryResult = { data: unknown; error: { message?: string } | null };
type Query = PromiseLike<QueryResult>;
type QueryBuilder = Query & {
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): Query;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  single(): Query;
};
type Database = { from(table: string): { select(columns: string): QueryBuilder } };
type RpcDatabase = Database & { rpc(name: string, parameters: Record<string, unknown>): Query };

export type AuthorizedWorkspaceContext = {
  documentId: string;
  documentIds: string[];
  documentText: string;
  documentTitle: string;
  motion: string;
  side: "pro" | "con";
  sourceIds: string[];
  threadId: string | null;
  workspaceId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseWorkspaceContext(value: unknown): AuthorizedWorkspaceContext | null {
  const input = record(value);
  if (!input || !UUID.test(String(input.workspaceId)) || !UUID.test(String(input.documentId))) return null;
  const sourceIds = Array.isArray(input.sourceIds) ? input.sourceIds.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, 20) : [];
  const documentIds = Array.isArray(input.documentIds) ? input.documentIds.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, 12) : [];
  const threadId = input.threadId === null || input.threadId === undefined ? null : String(input.threadId);
  if (threadId && !UUID.test(threadId) || documentIds.length === 0 || !documentIds.includes(String(input.documentId))) return null;
  if (input.side !== "pro" && input.side !== "con") return null;
  return {
    documentId: String(input.documentId),
    documentIds,
    documentText: String(input.documentText ?? "").slice(0, 24000),
    documentTitle: String(input.documentTitle ?? "").slice(0, 300),
    motion: String(input.motion ?? "").slice(0, 1200),
    side: input.side,
    sourceIds,
    threadId,
    workspaceId: String(input.workspaceId),
  };
}

export async function loadAuthorizedWorkspaceContext(database: RpcDatabase, userId: string, raw: unknown) {
  const input = parseWorkspaceContext(raw);
  if (!input) throw new Error("Invalid workspace context");
  const client = database;
  const [workspace, membership, document, sources, messages, durable] = await Promise.all([
    client.from("workspaces").select("id,motion,status").eq("id", input.workspaceId).single() as Query,
    client.from("workspace_members").select("user_id").eq("workspace_id", input.workspaceId).eq("user_id", userId).maybeSingle() as Query,
    client.from("workspace_documents").select("document_epoch,id,side,title").eq("workspace_id", input.workspaceId).eq("id", input.documentId).single() as Query,
    input.sourceIds.length
      ? client.from("workspace_sources").select("content,id,title,provenance").eq("workspace_id", input.workspaceId).in("id", input.sourceIds) as Query
      : Promise.resolve({ data: [], error: null }),
    input.threadId
      ? client.from("workspace_thread_messages").select("content,role,status").eq("workspace_id", input.workspaceId).eq("thread_id", input.threadId).eq("status", "complete").order("created_at", { ascending: false }).limit(12) as Query
      : Promise.resolve({ data: [], error: null }),
    database.rpc("get_workspace_ai_context", {
      p_document_ids: input.documentIds,
      p_source_ids: input.sourceIds,
      p_thread_id: input.threadId,
      p_user_id: userId,
      p_workspace_id: input.workspaceId,
    }),
  ]);
  if (workspace.error || membership.error || document.error || sources.error || messages.error || durable.error) throw new Error("Workspace unavailable");
  const workspaceRow = record(workspace.data);
  const memberRow = record(membership.data);
  const documentRow = record(document.data);
  const sourceRows = Array.isArray(sources.data) ? sources.data.map(record).filter(Boolean) as Record<string, unknown>[] : [];
  const messageRows = Array.isArray(messages.data) ? messages.data.map(record).filter(Boolean) as Record<string, unknown>[] : [];
  const durableContext = record(durable.data);
  const durableDocuments = Array.isArray(durableContext?.documents)
    ? durableContext.documents.map(record).filter(Boolean) as Record<string, unknown>[]
    : [];
  if (!workspaceRow || workspaceRow.status !== "active" || !memberRow || !documentRow || documentRow.side !== input.side) {
    throw new Error("Workspace unavailable");
  }
  if (sourceRows.length !== input.sourceIds.length) throw new Error("Workspace unavailable");
  if (input.threadId && messageRows.length === 0) {
    const thread = await client.from("workspace_threads").select("id").eq("workspace_id", input.workspaceId).eq("id", input.threadId).maybeSingle();
    if (thread.error || !thread.data) throw new Error("Workspace unavailable");
  }
  if (durableDocuments.length !== input.documentIds.length) throw new Error("Workspace unavailable");
  const sourceText = sourceRows.map((source) => `SOURCE: ${String(source.title)}\n${String(source.content).slice(0, 8000)}`).join("\n\n");
  const threadText = messageRows.reverse().map((message) => `${String(message.role).toUpperCase()}: ${String(message.content).slice(0, 4000)}`).join("\n");
  const documentText = durableDocuments.map((item) => [
    `${String(item.side).toUpperCase()} DOCUMENT: ${String(item.title)}`,
    String(item.text ?? "").slice(0, 24000),
  ].join("\n")).join("\n\n");
  return {
    context: [
      `WORKSPACE MOTION: ${String(workspaceRow.motion).slice(0, 1200)}`,
      `SELECTED ${input.side.toUpperCase()} DOCUMENT: ${String(documentRow.title ?? input.documentTitle)}`,
      documentText ? `DURABLE DOCUMENT CONTENT:\n${documentText}` : "",
      sourceText,
      threadText ? `SHARED THREAD:\n${threadText}` : "",
    ].filter(Boolean).join("\n\n").slice(0, 50000),
    input,
    meta: {
      includedDocuments: durableDocuments.length,
      includedSources: sourceRows.length,
      includedThreadMessages: messageRows.length,
      omittedSources: Math.max(0, input.sourceIds.length - sourceRows.length),
    },
  };
}

export async function isWorkspaceMember(database: Database, userId: string, workspaceId: string) {
  const client = database;
  const [workspace, member] = await Promise.all([
    client.from("workspaces").select("status").eq("id", workspaceId).single(),
    client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);
  return !workspace.error && !member.error && record(workspace.data)?.status === "active" && Boolean(member.data);
}
