import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { askChat } from "@/lib/ai/client";
import { useSessionStore } from "@/lib/stores/session-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useSparringStore } from "@/lib/stores/sparring-store";
import {
  createWorkspaceThread,
  listWorkspacePractice,
  saveWorkspaceArtifact,
  saveWorkspaceSource,
  saveWorkspaceThreadMessage,
  type WorkspaceSource,
} from "@/lib/workspace/practice-client";
import { workspaceRouteState, type WorkspaceTool, type WorkspaceToolContext } from "@/lib/workspace/tool-context";

const TOOL_ROUTES: Array<{ tool: WorkspaceTool; route: string }> = [
  { tool: "generate", route: "/app/generate" },
  { tool: "factoids", route: "/app/factoids" },
  { tool: "brainstorm", route: "/app/brainstorm" },
  { tool: "attack", route: "/app/attack" },
  { tool: "ask", route: "/app/ask" },
  { tool: "flowchart", route: "/app/flowchart" },
  { tool: "crossfire", route: "/app/crossfire" },
  { tool: "sparring", route: "/app/sparring" },
];

export function WorkspacePracticePanel({
  documentEpoch,
  documentId,
  documents,
  documentText,
  documentTitle,
  motion,
  onInsertCitation,
  onSuggestRewrite,
  side,
  userId,
  workspaceId,
}: {
  documentEpoch: number;
  documentId: string;
  documents: Array<{ id: string; side: "pro" | "con"; title: string }>;
  documentText: string;
  documentTitle: string;
  motion: string;
  onInsertCitation: (source: WorkspaceSource) => void;
  onSuggestRewrite: (suggestion: { id: string; text: string }) => void;
  side: "pro" | "con";
  userId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const personalSources = useSessionStore((state) => state.sourceLibrary);
  const savedCases = useSessionStore((state) => state.savedCases);
  const savedAttacks = useSessionStore((state) => state.savedAttacks);
  const savedBrainstorms = useSessionStore((state) => state.savedBrainstorms);
  const savedFactoids = useSessionStore((state) => state.savedFactoids);
  const savedChats = useSessionStore((state) => state.savedChats);
  const savedFlowcharts = useSessionStore((state) => state.savedFlowcharts);
  const savedSparring = useSparringStore((state) => state.savedSessions);
  const askConfig = useSettingsStore((state) => state.getFeatureConfig("ask"));
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([documentId]);
  const [threadName, setThreadName] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const practice = useQuery({
    queryKey: ["workspace-practice", userId, workspaceId],
    queryFn: () => listWorkspacePractice(workspaceId),
    refetchInterval: 3_000,
  });
  const visibleSources = useMemo(() => {
    const search = sourceSearch.trim().toLowerCase();
    return practice.data?.sources.filter((source) => !search || `${source.title} ${source.content}`.toLowerCase().includes(search)) ?? [];
  }, [practice.data?.sources, sourceSearch]);
  const selectedThread = threadId ?? practice.data?.threads[0]?.id ?? null;
  const threadMessages = practice.data?.messages.filter((item) => item.thread_id === selectedThread) ?? [];
  const privateResults = useMemo(() => [
    ...savedCases.map((item) => ({ ...item, tool: "generate" as const })),
    ...savedAttacks.map((item) => ({ ...item, tool: "attack" as const })),
    ...savedBrainstorms.map((item) => ({ ...item, tool: "brainstorm" as const })),
    ...savedFactoids.map((item) => ({ ...item, tool: "factoids" as const })),
    ...savedChats.map((item) => ({ ...item, tool: "ask" as const })),
    ...savedFlowcharts.map((item) => ({ ...item, tool: "flowchart" as const })),
    ...savedSparring.map((item) => ({ createdAt: item.createdAt, data: item, id: item.id, title: item.motion, tool: "sparring" as const })),
  ].sort((left, right) => right.createdAt - left.createdAt).slice(0, 10), [savedAttacks, savedBrainstorms, savedCases, savedChats, savedFactoids, savedFlowcharts, savedSparring]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workspace-practice", userId, workspaceId] });
  const run = async (operation: () => Promise<void>) => {
    if (busy || !navigator.onLine) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch {
      setError(t("workspaces.practiceFailed", "The workspace practice item could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  const context = (requestId: string = crypto.randomUUID()): WorkspaceToolContext => ({
    documentEpoch,
    documentId,
    documentIds: selectedDocumentIds.includes(documentId) ? selectedDocumentIds : [documentId, ...selectedDocumentIds].slice(0, 12),
    documentText,
    documentTitle,
    motion,
    requestId,
    returnUrl: `/app/workspaces/${workspaceId}`,
    side,
    sourceIds: selectedSourceIds.slice(0, 20),
    threadId: selectedThread,
    workspaceId,
  });
  const launch = (tool: WorkspaceTool, route: string) => {
    const session = useSessionStore.getState();
    if (tool === "generate") session.setGenerateForm({ motion, side });
    if (tool === "factoids") session.setFactoidsForm({ claim: documentText || motion, direction: side === "pro" ? "for" : "against" });
    if (tool === "brainstorm") session.setBrainstormForm({ context: documentText, motion, side });
    if (tool === "attack") session.setAttackForm({ caseText: documentText });
    if (tool === "flowchart") session.setPendingFlowchartData({
      edges: [],
      nodes: [{ id: `workspace-${documentId}`, position: { x: 300, y: 80 }, data: { description: documentText, label: documentTitle, type: "thesis" }, type: "custom" }],
    });
    const workspaceContext = context();
    navigate(route, {
      state: {
        ...workspaceRouteState(workspaceContext),
        ...(tool === "crossfire" ? { argument: documentText, resolution: motion } : {}),
      },
    });
  };
  const resume = (artifact: NonNullable<typeof practice.data>["artifacts"][number]) => {
    if (artifact.document_id !== documentId || artifact.document_epoch !== documentEpoch) return;
    navigate(TOOL_ROUTES.find(({ tool }) => tool === artifact.tool)?.route ?? context().returnUrl, {
      state: { workspaceArtifact: artifact.progress, workspaceContext: context(artifact.request_id) },
    });
  };

  const addSource = (event: FormEvent) => {
    event.preventDefault();
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    if (!title || !content) return;
    void run(async () => {
      await saveWorkspaceSource(workspaceId, { content, metadata: { capturedVia: "workspace" }, title, type: "text" });
      setSourceTitle("");
      setSourceContent("");
    });
  };

  const sendThreadMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!selectedThread || !content) return;
    const requestId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    setMessage("");
    void run(async () => {
      await saveWorkspaceThreadMessage({ content, requestId, role: "user", status: "complete", threadId: selectedThread, workspaceId });
      await saveWorkspaceThreadMessage({ content: "Thinking…", messageId: assistantMessageId, requestId, role: "assistant", status: "progress", threadId: selectedThread, workspaceId });
      try {
        const result = await askChat(
          content,
          threadMessages.filter(({ status }) => status === "complete").map(({ role, content: item }) => ({ role, content: item })),
          "general",
          askConfig,
          { workspaceContext: context(requestId) },
        );
        await saveWorkspaceThreadMessage({ content: result.response, messageId: assistantMessageId, requestId, role: "assistant", status: "complete", threadId: selectedThread, workspaceId });
      } catch (cause) {
        await saveWorkspaceThreadMessage({
          content: cause instanceof Error ? cause.message : "Interrupted",
          messageId: assistantMessageId,
          requestId,
          role: "assistant",
          status: "interrupted",
          threadId: selectedThread,
          workspaceId,
        });
        throw cause;
      }
    });
  };
  const suggestRewrite = () => {
    const requestId = crypto.randomUUID();
    const workspaceContext = context(requestId);
    void run(async () => {
      const result = await askChat(
        "Rewrite the selected debate document for clarity and persuasive force. Return only the replacement document text.",
        [],
        "general",
        askConfig,
        { workspaceContext },
      );
      await saveWorkspaceArtifact({
        documentEpoch,
        documentId,
        inputSnapshot: { documentText, instruction: "rewrite" },
        outputSnapshot: result,
        requestId,
        status: "complete",
        tool: "ask",
        workspaceId,
      });
      onSuggestRewrite({ id: requestId, text: result.response });
    });
  };

  return (
    <div className="grid gap-3">
      <details className="rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer font-medium">{t("workspaces.evidence", "Evidence")}</summary>
        <form className="mt-3 grid gap-2" onSubmit={addSource}>
          <Input aria-label={t("workspaces.sourceTitle", "Source title")} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} />
          <Textarea aria-label={t("workspaces.quotedEvidence", "Quoted evidence")} value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} />
          <Button type="submit" size="sm" disabled={busy || !sourceTitle.trim() || !sourceContent.trim()}>{t("workspaces.addEvidence", "Add evidence")}</Button>
        </form>
        {personalSources.length > 0 && (
          <div className="mt-3 grid gap-1 border-t border-border pt-3">
            <p className="text-xs font-medium">{t("workspaces.copyPrivateSource", "Copy from private library")}</p>
            {personalSources.slice(0, 10).map((source) => (
              <Button key={source.id} type="button" size="sm" variant="ghost" className="justify-start" disabled={busy} onClick={() => void run(async () => { await saveWorkspaceSource(workspaceId, source); })}>
                {source.title}
              </Button>
            ))}
          </div>
        )}
        <Input className="mt-3" aria-label={t("workspaces.searchEvidence", "Search evidence")} value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} />
        <div className="mt-2 grid gap-2">
          {visibleSources.map((source) => (
            <div key={source.id} className="rounded-md border border-border p-2 text-sm">
              <p className="font-medium">{source.title}</p>
              <blockquote className="mt-1 line-clamp-3 border-l-2 border-border pl-2 text-xs text-muted-foreground">{source.content}</blockquote>
              <div className="mt-2 flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => onInsertCitation(source)}>{t("workspaces.insertCitation", "Insert citation")}</Button>
                <Button
                  type="button"
                  size="sm"
                  variant={selectedSourceIds.includes(source.id) ? "secondary" : "ghost"}
                  aria-pressed={selectedSourceIds.includes(source.id)}
                  onClick={() => setSelectedSourceIds((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])}
                >
                  {t("workspaces.useInContext", "Use in AI context")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer font-medium">{t("workspaces.teamThreads", "Team threads")}</summary>
        <form className="mt-3 flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          const name = threadName.trim();
          if (!name) return;
          void run(async () => { const id = await createWorkspaceThread(workspaceId, name); setThreadId(id); setThreadName(""); });
        }}>
          <Input aria-label={t("workspaces.threadName", "Thread name")} value={threadName} onChange={(event) => setThreadName(event.target.value)} />
          <Button type="submit" size="sm" disabled={busy || !threadName.trim()}>{t("workspaces.createThread", "Create")}</Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1">
          {practice.data?.threads.map((thread) => <Button key={thread.id} type="button" size="sm" variant={selectedThread === thread.id ? "secondary" : "ghost"} onClick={() => setThreadId(thread.id)}>{thread.name}</Button>)}
        </div>
        {selectedThread && (
          <>
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto">
              {threadMessages.map((item) => <p key={item.id} className="rounded-md bg-accent px-2 py-1 text-sm"><span className="font-medium">{item.role === "user" ? t("workspaces.you", "You") : "DebateLab"}:</span> {item.content} {item.status !== "complete" && <span className="text-xs text-muted-foreground">({item.status})</span>}</p>)}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={sendThreadMessage}>
              <Input aria-label={t("workspaces.threadMessage", "Team message")} value={message} onChange={(event) => setMessage(event.target.value)} />
              <Button type="submit" size="sm" disabled={busy || !message.trim()}>{t("workspaces.send", "Send")}</Button>
            </form>
          </>
        )}
      </details>

      <details className="rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer font-medium">{t("workspaces.practice", "Practice")}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{t("workspaces.sharedScope", "Workspace-started sessions use shared case context and attach results here.")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("workspaces.contextSummary", "Included: selected document, {{included}} sources{{thread}}. Omitted: {{omitted}} sources.", {
            included: selectedSourceIds.length,
            omitted: Math.max(0, (practice.data?.sources.length ?? 0) - selectedSourceIds.length),
            thread: selectedThread ? t("workspaces.contextThread", ", shared thread") : "",
          })}
        </p>
        <div className="mt-2 flex flex-wrap gap-1" aria-label={t("workspaces.contextDocuments", "AI context documents")}>
          {documents.map((document) => (
            <Button
              key={document.id}
              type="button"
              size="sm"
              variant={selectedDocumentIds.includes(document.id) ? "secondary" : "ghost"}
              aria-pressed={selectedDocumentIds.includes(document.id)}
              onClick={() => setSelectedDocumentIds((current) => current.includes(document.id)
                ? current.length === 1 ? current : current.filter((id) => id !== document.id)
                : [...current, document.id].slice(0, 12))}
            >
              {document.side === "pro" ? t("workspaces.proSide", "For") : t("workspaces.conSide", "Against")} · {document.title}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TOOL_ROUTES.map(({ tool, route }) => (
            <Button key={tool} type="button" size="sm" variant="outline" onClick={() => launch(tool, route)}>
              {t(`nav.${tool}`, tool)}
            </Button>
          ))}
        </div>
        <Button className="mt-2 w-full" type="button" size="sm" disabled={busy || !documentText.trim()} onClick={suggestRewrite}>
          {t("workspaces.suggestRewrite", "Suggest AI rewrite")}
        </Button>
        {privateResults.length > 0 && (
          <div className="mt-3 grid gap-1 border-t border-border pt-3">
            <p className="text-xs font-medium">{t("workspaces.sharePrivateResult", "Share a private result")}</p>
            {privateResults.map((item) => (
              <Button key={`${item.tool}:${item.id}`} type="button" size="sm" variant="ghost" className="justify-start" disabled={busy} onClick={() => void run(async () => {
                await saveWorkspaceArtifact({
                  documentEpoch,
                  documentId,
                  inputSnapshot: { copiedFromPrivate: true, title: item.title },
                  outputSnapshot: item.data,
                  requestId: crypto.randomUUID(),
                  status: "complete",
                  tool: item.tool,
                  workspaceId,
                });
              })}>
                {t("workspaces.shareResult", "Share")} · {item.title}
              </Button>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-2">
          {practice.data?.artifacts.slice(0, 10).map((artifact) => (
            <details key={artifact.id} className="rounded-md border border-border px-2 py-1 text-xs">
              <summary className="cursor-pointer"><span className="font-medium">{t(`nav.${artifact.tool}`, artifact.tool)}</span> · {artifact.status}</summary>
              {artifact.output_snapshot !== null && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(artifact.output_snapshot, null, 2)}</pre>}
              {artifact.status !== "complete" && (artifact.tool === "crossfire" || artifact.tool === "sparring") && artifact.document_id === documentId && artifact.document_epoch === documentEpoch && (
                <Button className="mt-2" type="button" size="sm" variant="outline" onClick={() => resume(artifact)}>
                  {t("workspaces.resumePractice", "Resume")}
                </Button>
              )}
            </details>
          ))}
        </div>
      </details>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
