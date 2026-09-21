import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getWorkspaceBundle } from "@/lib/workspace/client";

export default function WorkspacePage() {
  const { t } = useTranslation();
  const { workspaceId = "" } = useParams();
  const [side, setSide] = useState<"pro" | "con">("pro");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const workspace = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWorkspaceBundle(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const documents = useMemo(
    () => workspace.data?.documents.filter((document) => document.side === side && document.state === "active") ?? [],
    [side, workspace.data?.documents],
  );
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];

  useEffect(() => {
    setSelectedDocumentId(documents[0]?.id ?? null);
  }, [documents]);

  if (workspace.isLoading) {
    return <p role="status" className="container px-4 py-8 text-sm text-muted-foreground">{t("workspaces.loadingOne", "Opening workspace...")}</p>;
  }
  if (workspace.isError || !workspace.data) {
    return <p role="alert" className="container px-4 py-8 text-sm text-destructive">{t("workspaces.unavailable", "Workspace unavailable.")}</p>;
  }

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto min-h-[72vh] max-w-7xl">
        <p className="text-sm text-muted-foreground">{workspace.data.workspace.motion}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {workspace.data.workspace.title ?? t("workspaces.editorTitle", "Debate workspace")}
        </h1>

        <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1" aria-label={t("workspaces.side", "Side")}>
          <Button type="button" size="sm" variant={side === "pro" ? "default" : "ghost"} onClick={() => setSide("pro")}>
            {t("workspaces.proSide", "A favor")}
          </Button>
          <Button type="button" size="sm" variant={side === "con" ? "default" : "ghost"} onClick={() => setSide("con")}>
            {t("workspaces.conSide", "En contra")}
          </Button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="rounded-lg border border-border bg-card p-3" aria-label={t("workspaces.files", "Files")}>
            <div className="grid gap-1">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(document.id)}
                  className="motion-press rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block font-medium">{document.title}</span>
                  {document.assignee_id && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("workspaces.assignedTo", "Assigned to {{member}}", {
                        member: `Member ${document.assignee_id.slice(0, 4)}`,
                      })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-border bg-card p-4" aria-label={selectedDocument?.title ?? t("workspaces.document", "Document")}>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <h2 className="text-xl font-semibold">{selectedDocument?.title}</h2>
              {selectedDocument?.assignee_id && <Badge variant="outline">{t("workspaces.assigned", "Assigned")}</Badge>}
            </div>
            <div
              role="textbox"
              aria-label={t("workspaces.documentEditor", "Document editor")}
              contentEditable={workspace.data.workspace.status === "active"}
              suppressContentEditableWarning
              className="mt-4 min-h-64 rounded-md border border-input bg-background p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
