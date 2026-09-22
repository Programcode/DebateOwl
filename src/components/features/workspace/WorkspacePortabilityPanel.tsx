import { useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { saveAs } from "file-saver";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  previewWorkspaceImport,
  fromWorkspaceMarkdown,
  toWorkspaceMarkdown,
  toWorkspaceDocx,
  toWorkspacePacketDocx,
  toWorkspacePacketPdf,
  toWorkspacePdf,
} from "@/lib/workspace/document-conversion";
import { listWorkspacePractice } from "@/lib/workspace/practice-client";
import {
  deletePrivateWritingItem,
  getWorkspaceExportManifest,
  listPrivateWritingItems,
  saveWorkspaceDocumentProvenance,
} from "@/lib/workspace/portability-client";
import { workspaceSchema } from "@/lib/workspace/schema";
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  exportGoogleDocument,
  importGoogleDocument,
  listGoogleConnections,
  pickGoogleDocument,
} from "@/lib/workspace/google-drive";

function download(bytes: Uint8Array, name: string, type: string) {
  saveAs(new Blob([new Uint8Array(bytes)], { type }), name);
}

export function WorkspacePortabilityPanel({
  content,
  documentId,
  documentTitle,
  onInsertContent,
  userId,
  workspaceId,
}: {
  content: JSONContent;
  documentId: string;
  documentTitle: string;
  onInsertContent: (content: JSONContent, mode: "insert" | "replace") => void;
  userId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<{
    content: JSONContent;
    markdown: string;
    name: string;
    provenance: Record<string, unknown>;
    sourceKind: "markdown" | "docx" | "google_docs";
    warnings: string[];
  } | null>(null);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [includeReview, setIncludeReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [googleExportRequestId, setGoogleExportRequestId] = useState(() => crypto.randomUUID());
  const library = useQuery({ queryKey: ["private-writing-items", userId], queryFn: listPrivateWritingItems });
  const practice = useQuery({ queryKey: ["workspace-practice", userId, workspaceId], queryFn: () => listWorkspacePractice(workspaceId) });
  const connections = useQuery({ queryKey: ["google-connections", userId], queryFn: listGoogleConnections });
  const selectedConnectionId = connectionId || connections.data?.[0]?.id || "";
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("workspaces.portabilityFailed", "The document operation failed."));
    } finally {
      setBusy(false);
    }
  };
  const insertItem = (value: unknown, mode: "insert" | "replace") => {
    try {
      onInsertContent(workspaceSchema.nodeFromJSON(value).toJSON(), mode);
    } catch {
      setError(t("workspaces.invalidLibraryItem", "This saved item is not a valid workspace document."));
    }
  };
  const packet = async (format: "docx" | "pdf") => {
    const manifest = await getWorkspaceExportManifest(workspaceId, selectedArtifactIds, includeReview);
    const bytes = format === "docx" ? await toWorkspacePacketDocx(manifest) : await toWorkspacePacketPdf(manifest);
    download(bytes, `workspace-packet.${format}`, format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
  };

  return (
    <details className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-medium">{t("workspaces.portability", "Import, reuse & export")}</summary>

      <div className="mt-3 grid gap-2">
        <p className="text-xs font-medium">{t("workspaces.privateWriting", "Private snippets and templates")}</p>
        {library.data?.map((item) => (
          <div key={item.id} role="group" aria-label={item.title} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2 text-sm">
            <span className="mr-auto min-w-0 truncate"><span className="text-xs text-muted-foreground">{item.kind}</span> · {item.title}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => insertItem(item.content, "insert")}>{t("workspaces.insertCopy", "Insert copy")}</Button>
            {item.kind === "template" && <Button type="button" size="sm" variant="outline" onClick={() => insertItem(item.content, "replace")}>{t("workspaces.useTemplate", "Use template")}</Button>}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => {
              await deletePrivateWritingItem(item.id);
              await queryClient.invalidateQueries({ queryKey: ["private-writing-items"] });
            })}>{t("common.delete", "Delete")}</Button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 border-t border-border pt-3">
        <label className="text-xs font-medium" htmlFor="workspace-document-import">{t("workspaces.importSpeech", "Import Markdown or DOCX")}</label>
        <input id="workspace-document-import" type="file" accept=".md,.markdown,.docx,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void run(async () => {
            const imported = await previewWorkspaceImport(file);
            setPreview({
              ...imported,
              name: file.name,
              provenance: { fileName: file.name, fileSize: file.size, importedAt: new Date().toISOString() },
              sourceKind: file.name.toLowerCase().endsWith(".docx") ? "docx" : "markdown",
            });
          });
        }} />
        {preview && (
          <div className="grid gap-2 rounded-md border border-border p-2">
            <p className="text-xs font-medium">{preview.name}</p>
            {preview.warnings.map((warning) => <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>)}
            <Textarea aria-label={t("workspaces.importPreview", "Import preview")} className="min-h-40" readOnly value={preview.markdown} />
            <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => {
              await saveWorkspaceDocumentProvenance({ documentId, provenance: preview.provenance, sourceKind: preview.sourceKind, workspaceId });
              onInsertContent(preview.content, "replace");
              setPreview(null);
            })}>{t("workspaces.replaceWithImport", "Replace with independent copy")}</Button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 border-t border-border pt-3">
        <p className="text-xs font-medium">{t("workspaces.exportDocument", "Export this document")}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => download(await toWorkspaceDocx(content), `${documentTitle}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))}>DOCX</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => download(await toWorkspacePdf(content), `${documentTitle}.pdf`, "application/pdf"))}>PDF</Button>
        </div>
        <p className="text-xs font-medium">{t("workspaces.packetArtifacts", "Practice feedback to include")}</p>
        {practice.data?.artifacts.filter((item) => item.status === "complete").map((artifact) => (
          <label key={artifact.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={selectedArtifactIds.includes(artifact.id)} onChange={() => setSelectedArtifactIds((current) => current.includes(artifact.id) ? current.filter((id) => id !== artifact.id) : [...current, artifact.id])} />
            {artifact.tool} · {new Date(artifact.created_at).toLocaleDateString()}
          </label>
        ))}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)} />
          {t("workspaces.includeReviewAppendix", "Include labelled review appendix")}
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => packet("docx"))}>{t("workspaces.exportPacketDocx", "Packet DOCX")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => packet("pdf"))}>{t("workspaces.exportPacketPdf", "Packet PDF")}</Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-border pt-3">
        <p className="text-xs font-medium">{t("workspaces.googleAccounts", "Google Drive accounts")}</p>
        {connections.data?.length ? (
          <>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label={t("workspaces.googleAccount", "Google account")} value={selectedConnectionId} onChange={(event) => setConnectionId(event.target.value)}>
              {connections.data.map((connection) => <option key={connection.id} value={connection.id}>{connection.account_label} · {connection.email}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy || !selectedConnectionId} onClick={() => void run(async () => {
                const picked = await pickGoogleDocument(selectedConnectionId);
                const imported = await importGoogleDocument(selectedConnectionId, picked.id);
                const markdown = imported.tabs.map((tab) => `# ${tab.title}\n\n${tab.markdown}`).join("\n\n");
                setPreview({
                  content: fromWorkspaceMarkdown(markdown),
                  markdown,
                  name: imported.title,
                  provenance: {
                    accountConnectionId: imported.accountConnectionId,
                    modifiedTime: imported.modifiedTime,
                    revision: imported.revision,
                    sourceUrl: imported.sourceUrl,
                    tabs: imported.tabs.map((tab) => tab.title),
                  },
                  sourceKind: "google_docs",
                  warnings: [],
                });
              })}>{t("workspaces.importGoogleDoc", "Choose Google Doc")}</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy || !selectedConnectionId} onClick={() => void run(async () => {
                const exported = await exportGoogleDocument({ connectionId: selectedConnectionId, markdown: toWorkspaceMarkdown(content), requestId: googleExportRequestId, title: documentTitle });
                setGoogleExportRequestId(crypto.randomUUID());
                window.open(exported.url, "_blank", "noopener,noreferrer");
              })}>{t("workspaces.exportGoogleDoc", "Export new Google Doc")}</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy || !selectedConnectionId} onClick={() => void run(async () => {
                await disconnectGoogleAccount(selectedConnectionId);
                setConnectionId("");
                await queryClient.invalidateQueries({ queryKey: ["google-connections", userId] });
              })}>{t("workspaces.disconnectGoogle", "Disconnect")}</Button>
            </div>
          </>
        ) : <p className="text-xs text-muted-foreground">{t("workspaces.noGoogleAccounts", "Connect a Google account to import or export Docs without changing your DebateLab login.")}</p>}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void connectGoogleAccount(`/app/workspaces/${workspaceId}`)}>{t("workspaces.connectGoogle", "Connect another Google account")}</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </details>
  );
}
