import { z } from "zod";
import { supabase } from "@/lib/supabase/client";

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
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  side: z.enum(["pro", "con"]),
  state: z.enum(["active", "archived", "trashed"]),
  title: z.string(),
});

export type WorkspaceBundle = {
  workspace: z.infer<typeof workspaceSchema>;
  members: z.infer<typeof workspaceMemberSchema>[];
  documents: z.infer<typeof workspaceDocumentSchema>[];
};

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
      .select("access_epoch,id,motion,owner_id,revision,status,title")
      .eq("id", workspaceId)
      .single(),
    supabase
      .from("workspace_members")
      .select("joined_at,user_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_documents")
      .select("assignee_id,document_epoch,id,position,side,state,title")
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
