import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import { COLLABORATION_URL } from "@/lib/workspace/collaboration-config";
import {
  deserializeProposal,
  serializeProposal,
  type QuoteAnchor,
  type WorkspaceProposal,
} from "@/lib/workspace/review";

const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  motion: z.string(),
  status: z.enum(["active", "archived", "deleted"]),
  title: z.string().nullable(),
  updated_at: z.string(),
});

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

const workspaceSchema = z.object({
  access_epoch: z.number().int().nonnegative(),
  id: z.string().uuid(),
  motion: z.string(),
  owner_id: z.string().uuid(),
  pending_owner_id: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(),
  status: z.enum(["active", "archived", "deleted"]),
  title: z.string().nullable(),
});

const workspaceMemberSchema = z.object({
  joined_at: z.string(),
  user_id: z.string().uuid(),
});

const workspaceDocumentSchema = z.object({
  assignee_id: z.string().uuid().nullable(),
  document_epoch: z.number().int().nonnegative(),
  durable_sequence: z.number().int().nonnegative(),
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  side: z.enum(["pro", "con"]),
  state: z.enum(["active", "archived", "trashed"]),
  title: z.string(),
});

export type WorkspaceDocument = z.infer<typeof workspaceDocumentSchema>;

export type WorkspaceBundle = {
  workspace: z.infer<typeof workspaceSchema>;
  members: z.infer<typeof workspaceMemberSchema>[];
  documents: z.infer<typeof workspaceDocumentSchema>[];
};

const workspaceVersionSchema = z.object({
  created_at: z.string(),
  durable_sequence: z.number().int().nonnegative(),
  id: z.string().uuid(),
  kind: z.enum(["automatic", "named", "pre_restore"]),
  name: z.string().nullable(),
});

export type WorkspaceVersion = z.infer<typeof workspaceVersionSchema>;

const workspaceVersionPreviewSchema = z.object({
  current_sequence: z.number().int().nonnegative(),
  snapshot_base64: z.string(),
});

export type WorkspaceVersionPreview = {
  currentSequence: number;
  snapshot: Uint8Array;
};

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,motion,status,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return workspaceSummarySchema.array().parse(data ?? []);
}

export async function getWorkspaceBundle(workspaceId: string): Promise<WorkspaceBundle> {
  const [workspaceResult, membersResult, documentsResult] = await Promise.all([
    supabase
      .from("workspaces")
      .select("access_epoch,id,motion,owner_id,pending_owner_id,revision,status,title")
      .eq("id", workspaceId)
      .single(),
    supabase
      .from("workspace_members")
      .select("joined_at,user_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_documents")
      .select("assignee_id,document_epoch,durable_sequence,id,position,side,state,title")
      .eq("workspace_id", workspaceId),
  ]);

  if (workspaceResult.error) throw workspaceResult.error;
  if (membersResult.error) throw membersResult.error;
  if (documentsResult.error) throw documentsResult.error;

  return {
    workspace: workspaceSchema.parse(workspaceResult.data),
    members: workspaceMemberSchema.array().parse(membersResult.data ?? []),
    documents: workspaceDocumentSchema.array().parse(documentsResult.data ?? [])
      .sort((left, right) => left.position - right.position),
  };
}

export async function listWorkspaceVersions(documentId: string) {
  const { data, error } = await supabase
    .from("workspace_versions")
    .select("created_at,durable_sequence,id,kind,name")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return workspaceVersionSchema.array().parse(data ?? []);
}

export async function createWorkspaceVersion(input: {
  documentId: string;
  name: string | null;
  workspaceId: string;
}) {
  const current = await supabase
    .from("workspace_documents")
    .select("durable_sequence")
    .eq("id", input.documentId)
    .single();
  if (current.error) throw current.error;
  const sequence = z.object({ durable_sequence: z.number().int().nonnegative() })
    .parse(current.data).durable_sequence;
  const { data, error } = await supabase.rpc("create_workspace_version", {
    p_document_id: input.documentId,
    p_expected_sequence: sequence,
    p_name: input.name,
    p_request_id: crypto.randomUUID(),
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function getWorkspaceVersionPreview(input: {
  documentId: string;
  versionId: string;
  workspaceId: string;
}): Promise<WorkspaceVersionPreview> {
  const { data, error } = await supabase.rpc("get_workspace_version_snapshot", {
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  const preview = workspaceVersionPreviewSchema.parse(data?.[0]);
  return {
    currentSequence: preview.current_sequence,
    snapshot: decodeBase64(preview.snapshot_base64),
  };
}

export async function restoreWorkspaceVersion(input: {
  documentId: string;
  previewedSequence: number;
  versionId: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("restore_workspace_version", {
    p_document_id: input.documentId,
    p_previewed_sequence: input.previewedSequence,
    p_request_id: crypto.randomUUID(),
    p_version_id: input.versionId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.number().int().nonnegative().parse(data);
}

export async function createWorkspaceDocument(input: {
  duplicateDocumentId?: string;
  expectedRevision: number;
  side: "pro" | "con";
  title: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("create_workspace_document", {
    p_duplicate_document_id: input.duplicateDocumentId ?? null,
    p_expected_revision: input.expectedRevision,
    p_request_id: crypto.randomUUID(),
    p_side: input.side,
    p_title: input.title,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.object({ document_id: z.string().uuid(), revision: z.number().int() }).parse(data?.[0]);
}

export async function updateWorkspaceDocument(input: {
  assigneeChanged?: boolean;
  assigneeId?: string | null;
  documentId: string;
  expectedRevision: number;
  orderedIds?: string[];
  side?: "pro" | "con";
  state?: "active" | "archived" | "trashed";
  title?: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("update_workspace_document", {
    p_assignee_changed: input.assigneeChanged ?? false,
    p_assignee_id: input.assigneeChanged ? input.assigneeId ?? null : null,
    p_document_id: input.documentId,
    p_expected_revision: input.expectedRevision,
    p_ordered_ids: input.orderedIds ?? null,
    p_request_id: crypto.randomUUID(),
    p_side: input.side ?? null,
    p_state: input.state ?? null,
    p_title: input.title ?? null,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.number().int().nonnegative().parse(data);
}

export async function changeWorkspaceState(input: {
  action: "archive" | "reopen" | "delete" | "restore";
  expectedRevision: number;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("change_workspace_state", {
    p_action: input.action,
    p_expected_revision: input.expectedRevision,
    p_request_id: crypto.randomUUID(),
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.number().int().nonnegative().parse(data);
}

export async function changeWorkspaceAccess(input: {
  action: "remove" | "propose_transfer" | "accept_transfer";
  expectedRevision: number;
  targetUserId: string;
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("change_workspace_access", {
    p_action: input.action,
    p_expected_revision: input.expectedRevision,
    p_request_id: crypto.randomUUID(),
    p_target_user_id: input.targetUserId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.number().int().nonnegative().parse(data);
}

export async function removeWorkspaceMember(input: {
  expectedRevision: number;
  requestId?: string;
  targetUserId: string;
  token: string;
  workspaceId: string;
}) {
  if (!COLLABORATION_URL) throw new Error("Collaboration service unavailable");
  const url = new URL(COLLABORATION_URL);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/access/remove";
  url.search = "";
  const requestId = input.requestId ?? crypto.randomUUID();
  const request = () => fetch(url, {
    body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      requestId,
      targetUserId: input.targetUserId,
      workspaceId: input.workspaceId,
    }),
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if (!response.ok) throw new Error("Workspace unavailable");
  return z.object({ revision: z.number().int().nonnegative() }).parse(await response.json()).revision;
}

const proposalRowSchema = z.object({ payload: z.unknown() });

export async function listWorkspaceProposals(documentId: string) {
  const { data, error } = await supabase
    .from("workspace_proposals")
    .select("payload")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return proposalRowSchema.array().parse(data ?? []).map(({ payload }) => deserializeProposal(payload));
}

export async function saveWorkspaceProposal(input: {
  documentId: string;
  proposal: WorkspaceProposal;
  workspaceId: string;
}) {
  const current = await supabase
    .from("workspace_documents")
    .select("durable_sequence")
    .eq("id", input.documentId)
    .single();
  if (current.error) throw current.error;
  const sequence = z.object({ durable_sequence: z.number().int().nonnegative() })
    .parse(current.data).durable_sequence;
  const { data, error } = await supabase.rpc("create_workspace_proposal", {
    p_document_epoch: input.proposal.documentEpoch,
    p_document_id: input.documentId,
    p_expected_sequence: sequence,
    p_payload: serializeProposal(input.proposal),
    p_proposal_id: input.proposal.id,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function decideWorkspaceProposal(input: {
  decision: "accepted" | "rejected";
  documentId: string;
  epoch: number;
  hunkId: string;
  proposalId: string;
  token: string;
}) {
  if (!COLLABORATION_URL) throw new Error("Collaboration service unavailable");
  const url = new URL(COLLABORATION_URL);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/review/decide";
  url.search = "";
  const response = await fetch(url, {
    body: JSON.stringify({
      decision: input.decision,
      documentId: input.documentId,
      epoch: input.epoch,
      hunkId: input.hunkId,
      proposalId: input.proposalId,
    }),
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("Proposal unavailable");
  const result = z.object({ proposal: z.unknown(), sequence: z.number().int().nonnegative() }).parse(await response.json());
  return { proposal: deserializeProposal(result.proposal), sequence: result.sequence };
}

const commentSchema = z.object({
  anchor: z.object({ quote: z.string() }).passthrough(),
  author_id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
  id: z.string().uuid(),
  resolved_at: z.string().nullable(),
});
const replySchema = z.object({
  author_id: z.string().uuid(),
  body: z.string(),
  comment_id: z.string().uuid(),
  created_at: z.string(),
  id: z.string().uuid(),
});

function serializeAnchor(anchor: QuoteAnchor) {
  return { ...anchor, from: Array.from(anchor.from), to: Array.from(anchor.to) };
}

export async function listWorkspaceComments(documentId: string, workspaceId: string) {
  const [comments, replies] = await Promise.all([
    supabase.from("workspace_comments").select("anchor,author_id,body,created_at,id,resolved_at").eq("document_id", documentId).order("created_at"),
    supabase.from("workspace_comment_replies").select("author_id,body,comment_id,created_at,id").eq("workspace_id", workspaceId).order("created_at"),
  ]);
  if (comments.error) throw comments.error;
  if (replies.error) throw replies.error;
  const parsedReplies = replySchema.array().parse(replies.data ?? []);
  return commentSchema.array().parse(comments.data ?? []).map((comment) => ({
    ...comment,
    replies: parsedReplies.filter((reply) => reply.comment_id === comment.id),
  }));
}

export async function createWorkspaceComment(input: {
  anchor: QuoteAnchor;
  body: string;
  documentId: string;
  mentionIds: string[];
  workspaceId: string;
}) {
  const { data, error } = await supabase.rpc("create_workspace_comment", {
    p_anchor: serializeAnchor(input.anchor),
    p_body: input.body,
    p_comment_id: input.anchor.id,
    p_document_id: input.documentId,
    p_mention_ids: input.mentionIds,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}

export async function replyWorkspaceComment(workspaceId: string, commentId: string, body: string) {
  const { error } = await supabase.rpc("reply_workspace_comment", {
    p_body: body,
    p_comment_id: commentId,
    p_reply_id: crypto.randomUUID(),
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
}

export async function resolveWorkspaceComment(workspaceId: string, commentId: string, resolved: boolean) {
  const { error } = await supabase.rpc("resolve_workspace_comment", {
    p_comment_id: commentId,
    p_resolved: resolved,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
}

export async function listWorkspaceNotifications(documentId: string) {
  const { data, error } = await supabase
    .from("workspace_notifications")
    .select("comment_id,created_at,id,read_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return z.object({
    comment_id: z.string().uuid(),
    created_at: z.string(),
    id: z.string().uuid(),
    read_at: z.string().nullable(),
  }).array().parse(data ?? []);
}
