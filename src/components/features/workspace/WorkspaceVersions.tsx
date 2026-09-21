import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditorContent } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import * as Y from "yjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createWorkspaceVersion,
  getWorkspaceVersionPreview,
  listWorkspaceVersions,
  restoreWorkspaceVersion,
  type WorkspaceVersionPreview,
} from "@/lib/workspace/client";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";

function VersionPreview({ ariaLabel, preview }: { ariaLabel: string; preview: WorkspaceVersionPreview }) {
  const [editor, setEditor] = useState<ReturnType<typeof createWorkspaceEditor> | null>(null);

  useEffect(() => {
    const document = new Y.Doc();
    Y.applyUpdate(document, preview.snapshot);
    const nextEditor = createWorkspaceEditor(document, { editable: false, ariaLabel });
    setEditor(nextEditor);
    return () => {
      nextEditor.destroy();
      document.destroy();
    };
  }, [ariaLabel, preview]);

  return editor ? <EditorContent editor={editor} /> : null;
}

export function WorkspaceVersions({
  canWrite,
  documentId,
  userId,
  workspaceId,
}: {
  canWrite: boolean;
  documentId: string;
  userId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const versions = useQuery({
    queryKey: ["workspace-versions", userId, documentId],
    queryFn: () => listWorkspaceVersions(documentId),
  });
  const save = useMutation({
    mutationFn: () => createWorkspaceVersion({ documentId, name: name.trim() || null, workspaceId }),
    onError: () => setError(t("workspaces.versionSaveFailed", "Version could not be saved.")),
    onSuccess: () => {
      setError(null);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["workspace-versions", userId, documentId] });
    },
  });
  const preview = useQuery({
    queryKey: ["workspace-version-preview", userId, documentId, selectedVersionId],
    queryFn: () => getWorkspaceVersionPreview({
      documentId,
      versionId: selectedVersionId!,
      workspaceId,
    }),
    enabled: selectedVersionId !== null,
  });
  const restore = useMutation({
    mutationFn: () => restoreWorkspaceVersion({
      documentId,
      previewedSequence: preview.data!.currentSequence,
      versionId: selectedVersionId!,
      workspaceId,
    }),
    onError: () => setError(t("workspaces.versionRestoreConflict", "The document changed. Preview the version again before restoring.")),
    onSuccess: () => window.location.reload(),
  });

  return (
    <details className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-medium">{t("workspaces.versionHistory", "Version history")}</summary>
      <div className="mt-3 flex gap-2">
        <Input aria-label={t("workspaces.versionName", "Version name")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("workspaces.versionName", "Version name")} />
        <Button type="button" onClick={() => save.mutate()} disabled={!canWrite || save.isPending}>{t("workspaces.saveVersion", "Save version")}</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 grid gap-2">
        {versions.data?.map((version) => (
          <div key={version.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="min-w-0 truncate text-sm">{version.name ?? t(`workspaces.versionKind.${version.kind}`, version.kind)}</span>
            <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => setSelectedVersionId(version.id)} aria-pressed={selectedVersionId === version.id}>
              {t("workspaces.preview", "Preview")}
            </Button>
          </div>
        ))}
      </div>
      {preview.isError && <p role="alert" className="mt-2 text-sm text-destructive">{t("workspaces.versionPreviewFailed", "Version preview could not be loaded.")}</p>}
      {preview.data && (
        <div className="mt-3 rounded-md border border-border" aria-label={t("workspaces.versionPreview", "Version preview")}>
          <VersionPreview ariaLabel={t("workspaces.versionPreview", "Version preview")} preview={preview.data} />
          <div className="border-t border-border p-2 text-right">
            <Button type="button" size="sm" variant="destructive" onClick={() => restore.mutate()} disabled={!canWrite || restore.isPending}>
              {t("workspaces.restoreVersion", "Restore this version")}
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}
