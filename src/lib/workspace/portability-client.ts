import { z } from "zod";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { JSONContent } from "@tiptap/core";
import { supabase } from "@/lib/supabase/client";
import { WORKSPACE_CONTENT_FIELD, workspaceSchema } from "./schema";

const writingItemSchema = z.object({
  content: z.unknown(),
  created_at: z.string(),
  id: z.string().uuid(),
  kind: z.enum(["snippet", "template"]),
  provenance: z.record(z.string(), z.unknown()),
  title: z.string(),
  updated_at: z.string(),
});
export type PrivateWritingItem = z.infer<typeof writingItemSchema>;

const manifestSchema = z.object({
  artifacts: z.array(z.object({
    createdAt: z.string(),
    documentId: z.string().uuid().nullable(),
    id: z.string().uuid(),
    output: z.unknown().nullable(),
    status: z.string(),
    tool: z.string(),
  })),
  capturedAt: z.string(),
  documents: z.array(z.object({
    assigneeId: z.string().uuid().nullable(),
    epoch: z.number().int().nonnegative(),
    id: z.string().uuid(),
    position: z.number().int().nonnegative(),
    provenance: z.record(z.string(), z.unknown()).nullable(),
    sequence: z.number().int().nonnegative(),
    side: z.enum(["pro", "con"]),
    snapshot: z.string(),
    title: z.string(),
  })),
  excluded: z.object({ archived: z.number(), trashed: z.number() }),
  sources: z.array(z.object({
    citationSnapshot: z.record(z.string(), z.unknown()),
    id: z.string().uuid(),
    provenance: z.record(z.string(), z.unknown()),
    title: z.string(),
  })),
  reviews: z.object({
    comments: z.array(z.record(z.string(), z.unknown())),
    proposals: z.array(z.record(z.string(), z.unknown())),
  }).nullable(),
  workspace: z.object({ id: z.string().uuid(), motion: z.string(), revision: z.number(), title: z.string().nullable() }),
});
export type WorkspaceExportManifest = z.infer<typeof manifestSchema> & {
  documents: Array<z.infer<typeof manifestSchema>["documents"][number] & { content: JSONContent }>;
};

export async function listPrivateWritingItems() {
  const { data, error } = await supabase.from("private_writing_items")
    .select("content,created_at,id,kind,provenance,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return writingItemSchema.array().parse(data ?? []);
}

export async function savePrivateWritingItem(input: {
  content: unknown;
  kind: "snippet" | "template";
  provenance?: Record<string, unknown>;
  title: string;
}) {
  const { data, error } = await supabase.from("private_writing_items")
    .insert({ ...input, provenance: input.provenance ?? {} })
    .select("id").single();
  if (error) throw error;
  return z.object({ id: z.string().uuid() }).parse(data).id;
}

export async function deletePrivateWritingItem(id: string) {
  const { error } = await supabase.from("private_writing_items").delete().eq("id", id);
  if (error) throw error;
}

export async function updatePrivateWritingItem(id: string, input: { content: unknown; title: string }) {
  const { error } = await supabase.from("private_writing_items")
    .update({ ...input, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

function decodeSnapshot(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const snapshot = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, snapshot);
    const json = yXmlFragmentToProsemirrorJSON(document.getXmlFragment(WORKSPACE_CONTENT_FIELD));
    return workspaceSchema.nodeFromJSON(json).toJSON();
  } finally {
    document.destroy();
  }
}

export async function getWorkspaceExportManifest(workspaceId: string, artifactIds: string[] = [], includeReview = false) {
  const { data, error } = await supabase.rpc("get_workspace_export_manifest", {
    p_artifact_ids: artifactIds,
    p_include_review: includeReview,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  const manifest = manifestSchema.parse(data);
  return { ...manifest, documents: manifest.documents.map((document) => ({ ...document, content: decodeSnapshot(document.snapshot) })) };
}

export async function saveWorkspaceDocumentProvenance(input: {
  documentId: string;
  provenance: Record<string, unknown>;
  sourceKind: "markdown" | "docx" | "google_docs";
  workspaceId: string;
}) {
  const { error } = await supabase.rpc("save_workspace_document_provenance", {
    p_document_id: input.documentId,
    p_provenance: input.provenance,
    p_source_kind: input.sourceKind,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw error;
}
