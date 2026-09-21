import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCodeInvite, revokeInvite, sendEmailInvite } from "@/lib/workspace/invite-client";
import { removeWorkspaceMember } from "@/lib/workspace/client";
import { changeWorkspaceAccess } from "@/lib/workspace/client";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function WorkspaceAccessPanel({
  members,
  onChanged,
  ownerId,
  pendingOwnerId,
  revision,
  token,
  userId,
  workspaceId,
}: {
  members: Array<{ user_id: string }>;
  onChanged: () => Promise<unknown>;
  ownerId: string;
  pendingOwnerId: string | null;
  revision: number;
  token: string;
  userId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const emailRequestId = useRef<string | null>(null);

  const issueCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const invite = await createCodeInvite(workspaceId, inviteId ?? undefined);
      setCode(invite.code);
      setInviteId(invite.inviteId);
    } catch {
      setMessage(t("workspaces.inviteFailed", "Invitation could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    emailRequestId.current ??= crypto.randomUUID();
    try {
      await sendEmailInvite(workspaceId, email.trim(), emailRequestId.current);
      emailRequestId.current = null;
      setEmail("");
      setMessage(t("workspaces.emailInviteSent", "Email invitation sent."));
    } catch {
      setMessage(t("workspaces.emailInviteRetry", "Delivery failed. Retry to continue the same invitation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-medium">{t("workspaces.invitePeople", "Invite people")}</summary>
      <div className="mt-3 grid gap-3">
        <Button type="button" variant="outline" disabled={busy || !online} onClick={() => void issueCode()}>
          {inviteId ? t("workspaces.rotateCode", "Rotate code") : t("workspaces.createCode", "Create join code")}
        </Button>
        {code && (
          <div className="flex gap-2">
            <Input readOnly aria-label={t("workspaces.joinCode", "Join code")} value={code} />
            <Button type="button" size="sm" onClick={() => void navigator.clipboard.writeText(code)}>{t("workspaces.copy", "Copy")}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || !online} onClick={() => void (async () => {
              setBusy(true);
              try {
                await revokeInvite(workspaceId, inviteId!);
                setCode(null);
                setInviteId(null);
              } catch {
                setMessage(t("workspaces.inviteFailed", "Invitation could not be created."));
              } finally {
                setBusy(false);
              }
            })()}>{t("workspaces.revoke", "Revoke")}</Button>
          </div>
        )}
        <form className="grid gap-2" onSubmit={sendEmail}>
          <Label htmlFor="workspace-invite-email">{t("workspaces.email", "Email")}</Label>
          <div className="flex gap-2">
            <Input id="workspace-invite-email" type="email" value={email} onChange={(event) => {
              setEmail(event.target.value);
              emailRequestId.current = null;
            }} />
            <Button type="submit" disabled={busy || !online || !email.trim()}>{t("workspaces.sendInvite", "Send")}</Button>
          </div>
        </form>
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium">{t("workspaces.members", "Members")}</p>
          <div className="mt-2 grid gap-1">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span>{t("workspaces.memberLabel", "Member {{id}}", { id: member.user_id.slice(0, 4) })}{member.user_id === ownerId ? ` · ${t("workspaces.owner", "Owner")}` : ""}</span>
                {member.user_id !== ownerId && (
                  <div className="flex gap-1">
                  {userId === ownerId && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy || !online} onClick={() => void (async () => {
                      setBusy(true);
                      try {
                        await changeWorkspaceAccess({ action: "propose_transfer", expectedRevision: revision, targetUserId: member.user_id, workspaceId });
                        await onChanged();
                      } catch {
                        setMessage(t("workspaces.transferFailed", "Ownership transfer could not be started."));
                      } finally {
                        setBusy(false);
                      }
                    })()}>{t("workspaces.transferOwner", "Make owner")}</Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" disabled={busy || !online} onClick={() => void (async () => {
                    setBusy(true);
                    setMessage(null);
                    try {
                      await removeWorkspaceMember({
                        expectedRevision: revision,
                        targetUserId: member.user_id,
                        token,
                        workspaceId,
                      });
                      await onChanged();
                    } catch {
                      setMessage(t("workspaces.removeFailed", "Member could not be removed."));
                    } finally {
                      setBusy(false);
                    }
                  })()}>{member.user_id === userId ? t("workspaces.leave", "Leave") : t("workspaces.removeMember", "Remove")}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {pendingOwnerId === userId && (
            <Button type="button" size="sm" className="mt-3" disabled={busy || !online} onClick={() => void (async () => {
              setBusy(true);
              try {
                await changeWorkspaceAccess({ action: "accept_transfer", expectedRevision: revision, targetUserId: userId, workspaceId });
                await onChanged();
              } catch {
                setMessage(t("workspaces.transferFailed", "Ownership transfer could not be started."));
              } finally {
                setBusy(false);
              }
            })()}>{t("workspaces.acceptOwnership", "Accept ownership")}</Button>
          )}
        </div>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </details>
  );
}
