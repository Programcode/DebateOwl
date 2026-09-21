import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import type { Source } from "@/lib/stores/session-store";

const sourceSchema = z.object({
  citation_snapshot: z.record(z.string(), z.unknown()),
  content: z.string(),
  created_at: z.string(),
  id: z.string().uuid(),
  provenance: z.record(z.string(), z.unknown()),
  source_type: z.enum(["url", "file", "text"]),
  title: z.string(),
});
const threadSchema = z.object({ created_at: z.string(), id: z.string().uuid(), name: z.string(), updated_at: z.string() });
const messageSchema = z.object({
  author_id: z.string().uuid(),
  content: z.string(),
  created_at: z.string(),
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  status: z.enum(["progress", "interrupted", "complete"]),
  thread_id: z.string().uuid(),
});
const artifactSchema = z.object({
  created_at: z.string(),
  document_epoch: z.number().int().nonnegative().nullable(),
  document_id: z.string().uuid().nullable(),
  id: z.string().uuid(),
  input_snapshot: z.unknown(),
  output_snapshot: z.unknown().nullable(),
  progress: z.unknown(),
  request_id: z.string().uuid(),
  status: z.enum(["progress", "interrupted", "complete"]),
  tool: z.enum(["generate", "factoids", "brainstorm", "attack", "ask", "flowchart", "crossfire", "sparring"]),
  updated_at: z.string(),
});

export type WorkspaceSource = z.infer<typeof sourceSchema>;
export type WorkspaceThread = z.infer<typeof threadSchema>;
export type WorkspaceThreadMessage = z.infer<typeof messageSchema>;
export type WorkspaceArtifact = z.infer<typeof artifactSchema>;

export async function listWorkspacePractice(workspaceId: string) {
  const [sources, threads, messages, artifacts] = await Promise.all([
    supabase.from("workspace_sources").select("citation_snapshot,content,created_at,id,provenance,source_type,title").eq("workspace_id", workspaceId).order("created_at"),
    supabase.from("workspace_threads").select("created_at,id,name,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    supabase.from("workspace_thread_messages").select("author_id,content,created_at,id,request_id,role,status,thread_id").eq("workspace_id", workspaceId).order("created_at"),
    supabase.from("workspace_artifacts").select("created_at,document_epoch,document_id,id,input_snapshot,output_snapshot,progress,request_id,status,tool,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
  ]);
  for (const result of [sources, threads, messages, artifacts]) if (result.error) throw result.error;
  return {
    artifacts: artifactSchema.array().parse(artifacts.data ?? []),
    messages: messageSchema.array().parse(messages.data ?? []),
    sources: sourceSchema.array().parse(sources.data ?? []),
    threads: threadSchema.array().parse(threads.data ?? []),
  };
}

export async function saveWorkspaceSource(workspaceId: string, source: Pick<Source, "content" | "metadata" | "origin" | "title" | "type">) {
  const id = crypto.randomUUID();
  const provenance = { ...(source.metadata ?? {}), ...(source.origin ? { origin: source.origin } : {}) };
  const { data, error } = await supabase.rpc("save_workspace_source", {
    p_citation_snapshot: { ...provenance, title: source.title, capturedAt: new Date().toISOString() },
    p_content: source.content,
    p_provenance: provenance,
    p_source_id: id,
    p_source_type: source.type,
    p_title: source.title,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function createWorkspaceThread(workspaceId: string, name: string) {
  const id = crypto.randomUUID();
  const { data, error } = await supabase.rpc("create_workspace_thread", {
    p_name: name,
    p_thread_id: id,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function saveWorkspaceThreadMessage(input: {
  content: string;
  messageId?: string;
  requestId: string;
  role: "user" | "assistant";
  status: "progress" | "interrupted" | "complete";
  threadId: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("save_workspace_thread_message", {
    p_content: input.content,
    p_message_id: input.messageId ?? crypto.randomUUID(),
    p_request_id: input.requestId,
    p_role: input.role,
    p_status: input.status,
    p_thread_id: input.threadId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function startWorkspaceThreadGeneration(input: {
  assistantMessageId: string;
  content: string;
  requestId: string;
  threadId: string;
  userMessageId: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("start_workspace_thread_generation", {
    p_assistant_message_id: input.assistantMessageId,
    p_content: input.content,
    p_request_id: input.requestId,
    p_thread_id: input.threadId,
    p_user_message_id: input.userMessageId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function saveWorkspaceArtifact(input: {
  artifactId?: string;
  documentEpoch: number | null;
  documentId: string | null;
  inputSnapshot: unknown;
  outputSnapshot?: unknown;
  progress?: unknown;
  requestId: string;
  status: "progress" | "interrupted" | "complete";
  tool: WorkspaceArtifact["tool"];
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("save_workspace_artifact", {
    p_artifact_id: input.artifactId ?? crypto.randomUUID(),
    p_document_epoch: input.documentEpoch,
    p_document_id: input.documentId,
    p_input_snapshot: input.inputSnapshot,
    p_output_snapshot: input.outputSnapshot ?? null,
    p_progress: input.progress ?? {},
    p_request_id: input.requestId,
    p_status: input.status,
    p_tool: input.tool,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}
