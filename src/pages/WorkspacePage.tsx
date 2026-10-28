import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceEditor, type SaveStatus } from "@/components/features/workspace/WorkspaceEditor";
import { WorkspaceAccessPanel } from "@/components/features/workspace/WorkspaceAccessPanel";
import { WorkspaceReviewPanel } from "@/components/features/workspace/WorkspaceReviewPanel";
import { WorkspaceVersions } from "@/components/features/workspace/WorkspaceVersions";
import { WorkspacePracticePanel } from "@/components/features/workspace/WorkspacePracticePanel";
import { useAuth } from "@/lib/supabase/AuthProvider";
import {
  changeWorkspaceState,
  createWorkspaceDocument,
  getWorkspaceBundle,
  updateWorkspaceDocument,
} from "@/lib/workspace/client";
import { loadWorkspacePreference, saveWorkspacePreference } from "@/lib/workspace/preferences";
import type { WorkspaceSource } from "@/lib/workspace/practice-client";

type DocumentView = "active" | "archived" | "trashed";

export default function WorkspacePage() {
  const { t } = useTranslation();
  const { session, user } = useAuth();
  const { workspaceId = "" } = useParams();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"pro" | "con">("pro");
  const [view, setView] = useState<DocumentView>("active");
  const [mobilePane, setMobilePane] = useState<"files" | "document" | "working">("files");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [durableSequence, setDurableSequence] = useState(0);
  const [editorStatus, setEditorStatus] = useState<SaveStatus>("Saving");
  const [newTitle, setNewTitle] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [citationToInsert, setCitationToInsert] = useState<WorkspaceSource | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ id: string; text: string } | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const workspace = useQuery({
    queryKey: ["workspace", user?.id, workspaceId],
    queryFn: () => getWorkspaceBundle(workspaceId),
    enabled: Boolean(user && workspaceId),
    refetchInterval: 5_000,
  });
  const documents = useMemo(
    () => workspace.data?.documents.filter((document) => document.side === side && document.state === view) ?? [],
    [side, view, workspace.data?.documents],
  );
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];

  useEffect(() => {
    if (user && workspaceId && !preferenceLoaded) {
      const preference = loadWorkspacePreference(user.id, workspaceId);
      if (preference) {
        setSide(preference.side);
        setSelectedDocumentId(preference.documentId);
      }
      setPreferenceLoaded(true);
    }
  }, [preferenceLoaded, user, workspaceId]);

  useEffect(() => {
    if (!preferenceLoaded || workspace.isLoading || !workspace.data) return;
    if (!selectedDocumentId || !documents.some(({ id }) => id === selectedDocumentId)) {
      setSelectedDocumentId(documents[0]?.id ?? null);
    }
  }, [documents, preferenceLoaded, selectedDocumentId, workspace.data, workspace.isLoading]);

  useEffect(() => {
    if (preferenceLoaded && user && workspaceId && view === "active") {
      saveWorkspacePreference(user.id, workspaceId, { documentId: selectedDocument?.id ?? null, side });
    }
  }, [preferenceLoaded, selectedDocument?.id, side, user, view, workspaceId]);

  useEffect(() => {
    setDurableSequence(selectedDocument?.durable_sequence ?? 0);
  }, [selectedDocument?.durable_sequence]);

  useEffect(() => {
    setEditorStatus("Saving");
    setDocumentText("");
    setCitationToInsert(null);
    setAiSuggestion(null);
  }, [selectedDocument?.id]);

  useEffect(() => {
    setRenameTitle(selectedDocument?.title ?? "");
  }, [selectedDocument?.id, selectedDocument?.title]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", user?.id, workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["workspaces", user?.id] }),
    ]);
  };

  const run = async (operation: () => Promise<unknown>) => {
    if (!navigator.onLine || busy) {
      setOperationError(t("workspaces.onlineRequired", "This action needs a connection."));
      return;
    }
    setBusy(true);
    setOperationError(null);
    try {
      await operation();
      await refresh();
    } catch {
      setOperationError(t("workspaces.updateFailed", "The workspace changed. Reload and try again."));
    } finally {
      setBusy(false);
    }
  };

  const reorder = (offset: -1 | 1) => {
    if (!workspace.data || !selectedDocument) return;
    const active = workspace.data.documents
      .filter((document) => document.side === selectedDocument.side && document.state === "active")
      .sort((left, right) => left.position - right.position);
    const from = active.findIndex(({ id }) => id === selectedDocument.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= active.length) return;
    [active[from], active[to]] = [active[to], active[from]];
    void run(() => updateWorkspaceDocument({
      documentId: selectedDocument.id,
      expectedRevision: workspace.data!.workspace.revision,
      orderedIds: active.map(({ id }) => id),
      workspaceId,
    }));
  };

  if (workspace.isLoading) {
    return <p role="status" className="container px-4 py-8 text-sm text-muted-foreground">{t("workspaces.loadingOne", "Opening workspace...")}</p>;
  }
  if (workspace.isError || !workspace.data) {
    return <p role="alert" className="container px-4 py-8 text-sm text-destructive">{t("workspaces.unavailable", "Workspace unavailable.")}</p>;
  }

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto min-h-[72vh] max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{workspace.data.workspace.motion}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
              {workspace.data.workspace.title ?? t("workspaces.editorTitle", "Debate workspace")}
            </h1>
          </div>
          <div className="flex gap-2">
            {(workspace.data.workspace.status !== "deleted" || workspace.data.workspace.owner_id === user?.id) && <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => changeWorkspaceState({
                  action: workspace.data!.workspace.status === "active"
                    ? "archive"
                    : workspace.data!.workspace.status === "archived" ? "reopen" : "restore",
                  expectedRevision: workspace.data!.workspace.revision,
                  workspaceId,
                }))}
              >
                {workspace.data.workspace.status === "active"
                  ? t("workspaces.archiveWorkspace", "Archive workspace")
                  : workspace.data.workspace.status === "archived"
                    ? t("workspaces.reopenWorkspace", "Reopen workspace")
                    : t("workspaces.restoreWorkspace", "Restore workspace")}
              </Button>}
            {workspace.data.workspace.owner_id === user?.id && workspace.data.workspace.status !== "deleted" && (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => {
                if (window.confirm(t("workspaces.deleteWorkspaceConfirm", "Delete this workspace? It can be restored for 30 days."))) {
                  void run(() => changeWorkspaceState({ action: "delete", expectedRevision: workspace.data!.workspace.revision, workspaceId }));
                }
              }}>{t("workspaces.deleteWorkspace", "Delete workspace")}</Button>
            )}
          </div>
        </div>
        {operationError && <p role="alert" className="mt-3 text-sm text-destructive">{operationError}</p>}

        <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1" aria-label={t("workspaces.side", "Side")}>
          <Button type="button" size="sm" variant={side === "pro" ? "default" : "ghost"} onClick={() => setSide("pro")}>
            {t("workspaces.proSide", "A favor")}
          </Button>
          <Button type="button" size="sm" variant={side === "con" ? "default" : "ghost"} onClick={() => setSide("con")}>
            {t("workspaces.conSide", "En contra")}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1 lg:hidden" aria-label={t("workspaces.mobilePane", "Workspace pane")}>
          {(["files", "document", "working"] as const).map((pane) => (
            <Button key={pane} type="button" size="sm" variant={mobilePane === pane ? "secondary" : "ghost"} onClick={() => setMobilePane(pane)}>
              {t(`workspaces.${pane}Pane`, pane)}
            </Button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
          <aside className={`${mobilePane === "files" ? "block" : "hidden"} rounded-lg border border-border bg-card p-3 lg:block`} aria-label={t("workspaces.files", "Files")}>
            <div className="mb-3 grid grid-cols-3 gap-1" aria-label={t("workspaces.fileView", "File view")}>
              {(["active", "archived", "trashed"] as const).map((state) => (
                <Button key={state} type="button" size="sm" variant={view === state ? "secondary" : "ghost"} onClick={() => setView(state)}>
                  {t(`workspaces.${state}Files`, state)}
                </Button>
              ))}
            </div>
            <div className="grid gap-1">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocumentId(document.id);
                    setMobilePane("document");
                  }}
                  className="motion-press rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block font-medium">{document.title}</span>
                  {document.assignee_id && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("workspaces.assignedTo", "Assigned to {{member}}", {
                        member: t("workspaces.memberLabel", "Member {{id}}", { id: document.assignee_id.slice(0, 4) }),
                      })}
                    </span>
                  )}
                </button>
              ))}
              {documents.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t("workspaces.noFiles", "No files here.")}</p>
              )}
            </div>
            {view === "active" && workspace.data.workspace.status === "active" && (
              <form
                className="mt-3 flex gap-2 border-t border-border pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = newTitle.trim();
                  if (!title) return;
                  void run(async () => {
                    await createWorkspaceDocument({
                      expectedRevision: workspace.data!.workspace.revision,
                      side,
                      title,
                      workspaceId,
                    });
                    setNewTitle("");
                  });
                }}
              >
                <Input aria-label={t("workspaces.newFileName", "New file name")} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
                <Button type="submit" size="sm" disabled={busy || !newTitle.trim()}>{t("workspaces.addFile", "Add")}</Button>
              </form>
            )}
          </aside>

          <section className={`${mobilePane === "document" ? "block" : "hidden"} min-w-0 rounded-lg border border-border bg-card p-4 lg:block`} aria-label={selectedDocument?.title ?? t("workspaces.document", "Document")}>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <h2 className="text-xl font-semibold">{selectedDocument?.title}</h2>
              {selectedDocument?.assignee_id && <Badge variant="outline">{t("workspaces.assigned", "Assigned")}</Badge>}
            </div>
            {selectedDocument && workspace.data.workspace.status === "active" && (
              <div className="grid gap-3 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex gap-2">
                  <Input aria-label={t("workspaces.fileName", "File name")} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !renameTitle.trim() || renameTitle.trim() === selectedDocument.title}
                    onClick={() => void run(() => updateWorkspaceDocument({
                      documentId: selectedDocument.id,
                      expectedRevision: workspace.data!.workspace.revision,
                      title: renameTitle,
                      workspaceId,
                    }))}
                  >
                    {t("workspaces.rename", "Rename")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {view === "active" ? (
                    <>
                      <Button type="button" size="sm" variant="ghost" onClick={() => reorder(-1)} disabled={busy}>{t("workspaces.moveUp", "Move up")}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => reorder(1)} disabled={busy}>{t("workspaces.moveDown", "Move down")}</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => createWorkspaceDocument({
                        duplicateDocumentId: selectedDocument.id,
                        expectedRevision: workspace.data!.workspace.revision,
                        side: selectedDocument.side,
                        title: `${selectedDocument.title} ${t("workspaces.copySuffix", "copy")}`,
                        workspaceId,
                      }))}>{t("workspaces.duplicate", "Duplicate")}</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => updateWorkspaceDocument({
                        documentId: selectedDocument.id,
                        expectedRevision: workspace.data!.workspace.revision,
                        state: "archived",
                        workspaceId,
                      }))}>{t("workspaces.archiveFile", "Archive")}</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => updateWorkspaceDocument({
                        documentId: selectedDocument.id,
                        expectedRevision: workspace.data!.workspace.revision,
                        state: "trashed",
                        workspaceId,
                      }))}>{t("workspaces.trashFile", "Trash")}</Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                      const orderedIds = workspace.data!.documents
                        .filter((document) => document.side === selectedDocument.side && document.state === "active")
                        .sort((left, right) => left.position - right.position)
                        .map(({ id }) => id)
                        .concat(selectedDocument.id);
                      await updateWorkspaceDocument({
                        documentId: selectedDocument.id,
                        expectedRevision: workspace.data!.workspace.revision,
                        orderedIds,
                        state: "active",
                        workspaceId,
                      });
                      setView("active");
                      setSelectedDocumentId(selectedDocument.id);
                    })}>{t("workspaces.restoreFile", "Restore")}</Button>
                  )}
                </div>
                {view === "active" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="workspace-assignee">{t("workspaces.assignee", "Assignee")}</Label>
                    <select
                      id="workspace-assignee"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedDocument.assignee_id ?? ""}
                      disabled={busy}
                      onChange={(event) => void run(() => updateWorkspaceDocument({
                        assigneeChanged: true,
                        assigneeId: event.target.value || null,
                        documentId: selectedDocument.id,
                        expectedRevision: workspace.data!.workspace.revision,
                        workspaceId,
                      }))}
                    >
                      <option value="">{t("workspaces.unassigned", "Unassigned")}</option>
                      {workspace.data.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>{t("workspaces.memberLabel", "Member {{id}}", { id: member.user_id.slice(0, 4) })}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {selectedDocument && session && user ? (
              <WorkspaceEditor
                aiSuggestion={aiSuggestion}
                citationToInsert={citationToInsert}
                documentId={selectedDocument.id}
                editable={workspace.data.workspace.status === "active" && view === "active"}
                epoch={selectedDocument.document_epoch}
                members={workspace.data.members}
                token={session.access_token}
                userId={user.id}
                userName={
                  typeof user.user_metadata?.full_name === "string"
                    ? user.user_metadata.full_name
                    : user.email ?? t("workspaces.memberLabel", "Member {{id}}", { id: user.id.slice(0, 4) })
                }
                workspaceId={workspace.data.workspace.id}
                onDurableSequence={setDurableSequence}
                onCitationInserted={() => setCitationToInsert(null)}
                onAiSuggestionConsumed={() => setAiSuggestion(null)}
                onSaveStatus={setEditorStatus}
                onTextChange={setDocumentText}
              />
            ) : (
              <p role="alert" className="p-4 text-sm text-destructive">
                {t("workspaces.unavailable", "Workspace unavailable.")}
              </p>
            )}
          </section>
          <aside className={mobilePane === "working" ? "block" : "hidden lg:block"} aria-label={t("workspaces.workingPanel", "Working panel")}>
            <div className="grid gap-3">
              {session && (
                <WorkspaceAccessPanel
                  members={workspace.data.members}
                  onChanged={refresh}
                  ownerId={workspace.data.workspace.owner_id}
                  pendingOwnerId={workspace.data.workspace.pending_owner_id}
                  revision={workspace.data.workspace.revision}
                  token={session.access_token}
                  userId={user!.id}
                  workspaceId={workspace.data.workspace.id}
                />
              )}
              {selectedDocument && (
                <>
                  {user && (
                    <WorkspacePracticePanel
                      key={`practice:${selectedDocument.id}`}
                      documentEpoch={selectedDocument.document_epoch}
                      documentId={selectedDocument.id}
                      documents={workspace.data.documents.filter((document) => document.state === "active").map(({ id, side, title }) => ({ id, side, title }))}
                      documentText={documentText}
                      documentTitle={selectedDocument.title}
                      motion={workspace.data.workspace.motion}
                      onInsertCitation={setCitationToInsert}
                      onSuggestRewrite={setAiSuggestion}
                      side={selectedDocument.side}
                      userId={user.id}
                      workspaceId={workspace.data.workspace.id}
                    />
                  )}
                  {session && (
                    <WorkspaceReviewPanel
                      key={`review:${selectedDocument.id}`}
                      documentId={selectedDocument.id}
                      epoch={selectedDocument.document_epoch}
                      editable={workspace.data.workspace.status === "active" && view === "active"}
                      onDurableSequence={setDurableSequence}
                      token={session.access_token}
                      userId={user!.id}
                      workspaceId={workspace.data.workspace.id}
                    />
                  )}
                  <WorkspaceVersions
                    key={`versions:${selectedDocument.id}`}
                    canWrite={workspace.data.workspace.status === "active" && view === "active" && editorStatus === "Saved"}
                    documentId={selectedDocument.id}
                    userId={user!.id}
                    workspaceId={workspace.data.workspace.id}
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
