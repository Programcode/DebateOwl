import { useEffect, useMemo, useRef, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorContent } from "@tiptap/react";
import { z } from "zod";
import * as Y from "yjs";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLLABORATION_URL } from "@/lib/workspace/collaboration-config";
import {
  deleteWorkspaceDraft,
  listWorkspaceDrafts,
  loadWorkspaceDraft,
  saveWorkspaceDraft,
  type WorkspaceDraft,
} from "@/lib/workspace/draft-store";
import { durableMutationFromMessage } from "@/lib/workspace/durable-ack";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";
import { createProposal, createQuoteAnchor, type ProposalHunkInput } from "@/lib/workspace/review";
import { createWorkspaceComment, saveWorkspaceProposal } from "@/lib/workspace/client";
import { useOnlineStatus } from "@/hooks/use-online-status";

const acknowledgementSchema = z.object({
  epoch: z.number().int().nonnegative(),
  kind: z.literal("durable-ack"),
  mutationId: z.string(),
  sequence: z.number().int().positive(),
});

export type SaveStatus = "Offline" | "Saved" | "Saving";

export function WorkspaceEditor({
  documentId,
  durableSequence,
  editable,
  epoch,
  members,
  token,
  userId,
  userName,
  workspaceId,
  onDurableSequence,
  onSaveStatus,
}: {
  documentId: string;
  durableSequence: number;
  editable: boolean;
  epoch: number;
  members: Array<{ user_id: string }>;
  token: string;
  userId: string;
  userName: string;
  workspaceId: string;
  onDurableSequence?: (sequence: number) => void;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const identity = useMemo(
    () => ({ documentId, epoch, userId, workspaceId }),
    [documentId, epoch, userId, workspaceId],
  );
  const [editor, setEditor] = useState<ReturnType<typeof createWorkspaceEditor> | null>(null);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<SaveStatus>(navigator.onLine ? "Saving" : "Offline");
  const [storageWarning, setStorageWarning] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [mentionId, setMentionId] = useState("");
  const [recoveryDrafts, setRecoveryDrafts] = useState<WorkspaceDraft[]>([]);
  const pending = useRef(new Set<string>());
  const suggestingRef = useRef(false);
  const sequenceRef = useRef(durableSequence);

  useEffect(() => {
    suggestingRef.current = suggesting;
  }, [suggesting]);

  useEffect(() => {
    sequenceRef.current = durableSequence;
  }, [durableSequence]);

  useEffect(() => {
    onSaveStatus?.(status);
  }, [onSaveStatus, status]);

  useEffect(() => {
    let disposed = false;
    setStatus(navigator.onLine ? "Saving" : "Offline");
    let provider: HocuspocusProvider | undefined;
    let activeEditor: ReturnType<typeof createWorkspaceEditor> | undefined;
    let bufferedHunk: ProposalHunkInput | undefined;
    let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
    const flushSuggestion = () => {
      if (!bufferedHunk || !activeEditor) return;
      const hunk = bufferedHunk;
      bufferedHunk = undefined;
      if (suggestionTimer) clearTimeout(suggestionTimer);
      suggestionTimer = undefined;
      if (!online || pending.current.size > 0) {
        if (!disposed) setReviewError(t("workspaces.saveBeforeSuggesting", "Wait for Saved before suggesting a change."));
        return;
      }
      const proposal = createProposal({
        authorId: userId,
        documentEpoch: epoch,
        editor: activeEditor,
        hunks: [hunk],
        id: crypto.randomUUID(),
      });
      void saveWorkspaceProposal({
        documentId,
        expectedSequence: sequenceRef.current,
        proposal,
        workspaceId,
      }).then(() => {
        if (disposed) return;
        setReviewError(null);
        void queryClient.invalidateQueries({ queryKey: ["workspace-proposals", documentId] });
      }).catch(() => {
        if (!disposed) setReviewError(t("workspaces.suggestionFailed", "Suggestion could not be saved."));
      });
    };
    const queueSuggestion = (hunk: ProposalHunkInput) => {
      const previous = bufferedHunk;
      const sameRange = previous?.kind === "insert" && hunk.kind === "insert"
        ? previous.at === hunk.at
        : previous?.kind === "format" && hunk.kind === "format"
          ? previous.from === hunk.from && previous.to === hunk.to
          : false;
      if (
        previous && previous.kind !== "delete" && hunk.kind === previous.kind && sameRange &&
        previous.content.length === 1 && hunk.content.length === 1 &&
        previous.content[0].type === "text" && hunk.content[0].type === "text" &&
        JSON.stringify(previous.content[0].marks ?? []) === JSON.stringify(hunk.content[0].marks ?? [])
      ) {
        bufferedHunk = {
          ...previous,
          content: [{ ...previous.content[0], text: `${previous.content[0].text ?? ""}${hunk.content[0].text ?? ""}` }],
        } as ProposalHunkInput;
      } else {
        flushSuggestion();
        bufferedHunk = hunk;
      }
      if (suggestionTimer) clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(flushSuggestion, 400);
    };
    const document = new Y.Doc();
    const persist = async () => {
      try {
        await saveWorkspaceDraft({
          ...identity,
          pendingMutationIds: [...pending.current],
          snapshot: Y.encodeStateAsUpdate(document),
          updatedAt: Date.now(),
        });
        if (!disposed) setStorageWarning(false);
      } catch {
        if (!disposed) setStorageWarning(true);
      }
    };
    const start = async () => {
      try {
        const drafts = await listWorkspaceDrafts(identity);
        if (!disposed) setRecoveryDrafts(drafts.filter((draft) => draft.epoch !== epoch));
        const draft = await loadWorkspaceDraft(identity);
        if (draft?.snapshot.byteLength) Y.applyUpdate(document, draft.snapshot);
        draft?.pendingMutationIds.forEach((mutationId) => pending.current.add(mutationId));
      } catch {
        if (!disposed) setStorageWarning(true);
      }
      if (disposed || !COLLABORATION_URL) return;

      provider = new HocuspocusProvider({
        document,
        name: `${documentId}@${epoch}`,
        onOutgoingMessage: ({ message }) => {
          void durableMutationFromMessage(message.toUint8Array()).then((mutation) => {
            if (!mutation || disposed) return;
            pending.current.add(mutation.mutationId);
            setStatus("Saving");
            void persist();
          });
        },
        onStateless: ({ payload }) => {
          let input: unknown;
          try {
            input = JSON.parse(payload);
          } catch {
            return;
          }
          const acknowledgement = acknowledgementSchema.safeParse(input);
          if (!acknowledgement.success || acknowledgement.data.epoch !== epoch) return;
          pending.current.delete(acknowledgement.data.mutationId);
          sequenceRef.current = acknowledgement.data.sequence;
          onDurableSequence?.(acknowledgement.data.sequence);
          setStatus(pending.current.size === 0 ? "Saved" : "Saving");
          if (pending.current.size === 0) void deleteWorkspaceDraft(identity);
          else void persist();
        },
        onStatus: ({ status: nextStatus }) => {
          if (nextStatus === "disconnected") setStatus("Offline");
        },
        onSynced: () => {
          if (pending.current.size > 0) {
            provider?.sendStateless(JSON.stringify({
              epoch,
              kind: "durable-ack-query",
              mutationIds: [...pending.current].slice(0, 100),
            }));
          } else {
            setStatus("Saved");
          }
        },
        token,
        url: COLLABORATION_URL,
      });
      activeEditor = createWorkspaceEditor(document, {
        ariaLabel: t("workspaces.documentEditor", "Document editor"),
        editable,
        isSuggesting: () => suggestingRef.current,
        onSuggestion: queueSuggestion,
        provider,
        user: { color: `hsl(${Math.abs(userId.charCodeAt(0) * 47) % 360} 70% 45%)`, name: userName },
      });
      document.on("update", (_update, origin) => {
        if (origin !== provider) setStatus("Saving");
        void persist();
      });
      if (!disposed) setEditor(activeEditor);
    };
    const offline = () => setStatus("Offline");
    const online = () => provider?.connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    void start();

    return () => {
      disposed = true;
      flushSuggestion();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      activeEditor?.destroy();
      provider?.destroy();
      document.destroy();
    };
  }, [documentId, editable, epoch, identity, onDurableSequence, online, queryClient, t, token, userId, userName, workspaceId]);

  if (!COLLABORATION_URL) {
    return <p role="alert" className="p-4 text-sm text-destructive">{t("workspaces.collaborationUnavailable", "Collaboration service is not configured.")}</p>;
  }
  if (!editor) return <p role="status" className="p-4 text-sm text-muted-foreground">{t("workspaces.openingEditor", "Opening editor...")}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2" role="toolbar" aria-label={t("workspaces.formatting", "Formatting")}>
        <Button type="button" size="sm" variant={suggesting ? "secondary" : "ghost"} aria-pressed={suggesting} onClick={() => setSuggesting((current) => !current)}>
          {suggesting ? t("workspaces.suggesting", "Suggesting") : t("workspaces.editing", "Editing")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>{t("workspaces.bold", "Bold")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>{t("workspaces.italic", "Italic")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>{t("workspaces.heading", "Heading")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()}>{t("workspaces.bullets", "Bullets")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleOrderedList().run()}>{t("workspaces.numberedList", "Numbered list")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().insertTable({ cols: 2, rows: 2, withHeaderRow: true }).run()}>{t("workspaces.table", "Table")}</Button>
        <Input className="h-9 w-48" aria-label={t("workspaces.linkUrl", "Link URL")} value={link} onChange={(event) => setLink(event.target.value)} />
        <Button type="button" size="sm" variant="outline" onClick={() => editor.chain().focus().setLink({ href: link }).run()}>{t("workspaces.link", "Link")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.commands.undo()}>{t("workspaces.undo", "Undo")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.commands.redo()}>{t("workspaces.redo", "Redo")}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!online} onClick={() => setCommentOpen((current) => !current)}>{t("workspaces.comment", "Comment")}</Button>
        <span className="ml-auto text-xs text-muted-foreground" role="status">{t(`workspaces.status${status}`, status)}</span>
      </div>
      {commentOpen && (
        <form className="grid gap-2 border-b border-border p-3" onSubmit={(event) => {
          event.preventDefault();
          const { from, to } = editor.state.selection;
          if (from === to || !commentBody.trim()) {
            setReviewError(t("workspaces.selectCommentText", "Select text before adding a comment."));
            return;
          }
          const id = crypto.randomUUID();
          const anchor = createQuoteAnchor({
            documentEpoch: epoch,
            editor,
            from,
            id,
            quote: editor.state.doc.textBetween(from, to),
            to,
          });
          void createWorkspaceComment({
            anchor,
            body: commentBody,
            documentId,
            mentionIds: mentionId ? [mentionId] : [],
            workspaceId,
          }).then(() => {
            setCommentBody("");
            setMentionId("");
            setCommentOpen(false);
            setReviewError(null);
            void queryClient.invalidateQueries({ queryKey: ["workspace-comments", documentId] });
          }).catch(() => setReviewError(t("workspaces.commentFailed", "Comment could not be saved.")));
        }}>
          <Input aria-label={t("workspaces.commentText", "Comment text")} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label={t("workspaces.mentionMember", "Mention member")} value={mentionId} onChange={(event) => setMentionId(event.target.value)}>
            <option value="">{t("workspaces.noMention", "No mention")}</option>
            {members.filter((member) => member.user_id !== userId).map((member) => (
              <option key={member.user_id} value={member.user_id}>@{t("workspaces.memberLabel", "Member {{id}}", { id: member.user_id.slice(0, 4) })}</option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={!online}>{t("workspaces.addComment", "Add comment")}</Button>
        </form>
      )}
      {storageWarning && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{t("workspaces.storageUnavailable", "Local recovery storage is unavailable.")}</p>}
      {reviewError && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{reviewError}</p>}
      {recoveryDrafts.map((draft) => (
        <div key={draft.epoch} className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/40 px-4 py-3 text-sm" role="alert">
          <span>{t("workspaces.recovery", "Recovery")}: {t("workspaces.oldDraft", "An offline draft from before the restore is available.")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => {
            const url = URL.createObjectURL(new Blob([Uint8Array.from(draft.snapshot).buffer], { type: "application/octet-stream" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `workspace-draft-${documentId}-epoch-${draft.epoch}.bin`;
            link.click();
            URL.revokeObjectURL(url);
          }}>{t("workspaces.exportDraft", "Export draft")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void deleteWorkspaceDraft(draft).then(() => setRecoveryDrafts((current) => current.filter((item) => item.epoch !== draft.epoch)))}>{t("workspaces.discardDraft", "Discard")}</Button>
        </div>
      ))}
      <EditorContent editor={editor} />
    </div>
  );
}
