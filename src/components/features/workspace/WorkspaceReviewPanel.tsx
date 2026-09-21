import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  decideWorkspaceProposal,
  listWorkspaceComments,
  listWorkspaceNotifications,
  listWorkspaceProposals,
  replyWorkspaceComment,
  resolveWorkspaceComment,
} from "@/lib/workspace/client";
import { useOnlineStatus } from "@/hooks/use-online-status";

function summarizeContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(summarizeContent).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  const node = value as { content?: unknown; marks?: Array<{ type?: unknown }>; text?: unknown; type?: unknown };
  const content = typeof node.text === "string" ? node.text : summarizeContent(node.content);
  const marks = node.marks?.map(({ type }) => typeof type === "string" ? type : "").filter(Boolean) ?? [];
  return marks.length ? `${content} [${marks.join(", ")}]` : content;
}

export function WorkspaceReviewPanel({
  documentId,
  editable,
  epoch,
  onDurableSequence,
  token,
  userId,
  workspaceId,
}: {
  documentId: string;
  editable: boolean;
  epoch: number;
  onDurableSequence: (sequence: number) => void;
  token: string;
  userId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const proposals = useQuery({
    queryKey: ["workspace-proposals", userId, documentId],
    queryFn: () => listWorkspaceProposals(documentId),
    refetchInterval: 2_000,
  });
  const comments = useQuery({
    queryKey: ["workspace-comments", userId, documentId],
    queryFn: () => listWorkspaceComments(documentId, workspaceId),
    refetchInterval: 2_000,
  });
  const notifications = useQuery({
    queryKey: ["workspace-notifications", userId, documentId],
    queryFn: () => listWorkspaceNotifications(documentId),
    refetchInterval: 2_000,
  });
  const decision = useMutation({
    mutationFn: (input: { decision: "accepted" | "rejected"; hunkId: string; proposalId: string }) =>
      decideWorkspaceProposal({ ...input, documentId, epoch, token }),
    onError: () => setError(t("workspaces.proposalDecisionFailed", "The change could not be decided.")),
    onSuccess: (result) => {
      setError(null);
      onDurableSequence(result.sequence);
      void queryClient.invalidateQueries({ queryKey: ["workspace-proposals", userId, documentId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-versions", userId, documentId] });
    },
  });

  const submitReply = async (event: FormEvent, commentId: string) => {
    event.preventDefault();
    const body = reply[commentId]?.trim();
    if (!body) return;
    try {
      await replyWorkspaceComment(workspaceId, commentId, body);
      setReply((current) => ({ ...current, [commentId]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["workspace-comments", userId, documentId] });
    } catch {
      setError(t("workspaces.commentFailed", "Comment could not be saved."));
    }
  };

  return (
    <details className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-medium">{t("workspaces.review", "Review")}</summary>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 grid gap-3">
        {notifications.data?.map((notification) => (
          <p key={notification.id} className="rounded-md bg-accent px-2 py-1 text-xs">
            {t("workspaces.mentionedYou", "A teammate mentioned you in a comment.")}
          </p>
        ))}
        {proposals.data?.flatMap((proposal) => proposal.hunks.map((hunk) => (
          <div key={`${proposal.id}:${hunk.id}`} className="rounded-md border border-border p-2 text-sm">
            <p className="font-medium">{t(`workspaces.proposal.${hunk.kind}`, hunk.kind)}</p>
            <p className="text-xs text-muted-foreground">{t(`workspaces.proposal.${hunk.status}`, hunk.status)}</p>
            <div className="mt-2 grid gap-1" aria-label={t("workspaces.changePreview", "Proposed change preview")}>
              <p className="text-xs font-medium">{t("workspaces.original", "Original")}</p>
              <del className="rounded bg-muted px-2 py-1 text-sm decoration-current">
                {summarizeContent(hunk.original) || t("workspaces.emptyChange", "Empty")}
              </del>
              <p className="text-xs font-medium">{t("workspaces.proposed", "Proposed")}</p>
              <ins className="rounded bg-accent px-2 py-1 text-sm no-underline">
                {summarizeContent(hunk.replacement) || t("workspaces.emptyChange", "Empty")}
              </ins>
            </div>
            {hunk.status === "pending" && (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" disabled={!editable || !online || decision.isPending} onClick={() => decision.mutate({ decision: "accepted", hunkId: hunk.id, proposalId: proposal.id })}>{t("workspaces.accept", "Accept")}</Button>
                <Button type="button" size="sm" variant="outline" disabled={!editable || !online || decision.isPending} onClick={() => decision.mutate({ decision: "rejected", hunkId: hunk.id, proposalId: proposal.id })}>{t("workspaces.reject", "Reject")}</Button>
              </div>
            )}
          </div>
        )))}
        {comments.data?.map((comment) => (
          <div key={comment.id} className="rounded-md border border-border p-2 text-sm">
            <blockquote className="border-l-2 border-border pl-2 text-xs text-muted-foreground">“{comment.anchor.quote}”</blockquote>
            <p className="mt-2">{comment.body}</p>
            {comment.replies.map((item) => <p key={item.id} className="mt-2 border-l-2 border-border pl-2">{item.body}</p>)}
            <form className="mt-2 flex gap-2" onSubmit={(event) => void submitReply(event, comment.id)}>
              <Input aria-label={t("workspaces.reply", "Reply")} value={reply[comment.id] ?? ""} onChange={(event) => setReply((current) => ({ ...current, [comment.id]: event.target.value }))} />
              <Button type="submit" size="sm" disabled={!editable || !online}>{t("workspaces.reply", "Reply")}</Button>
            </form>
            <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={!editable || !online} onClick={() => void resolveWorkspaceComment(workspaceId, comment.id, !comment.resolved_at)
              .then(() => queryClient.invalidateQueries({ queryKey: ["workspace-comments", userId, documentId] }))
              .catch(() => setError(t("workspaces.commentFailed", "Comment could not be saved.")))}>
              {comment.resolved_at ? t("workspaces.reopenComment", "Reopen") : t("workspaces.resolveComment", "Resolve")}
            </Button>
          </div>
        ))}
        {!proposals.data?.length && !comments.data?.length && <p className="text-sm text-muted-foreground">{t("workspaces.noReviewItems", "No review items yet.")}</p>}
      </div>
    </details>
  );
}
