import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemInvite } from "@/lib/workspace/invite-client";

export default function WorkspaceInvitePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useRef(new URLSearchParams(location.search).get("token"));
  const started = useRef(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(Boolean(token.current));
  const [error, setError] = useState<string | null>(null);

  const redeem = useCallback(async (input: { code?: string; token?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemInvite({ ...input, requestId: crypto.randomUUID() });
      navigate(`/app/workspaces/${result.workspaceId}`, { replace: true });
    } catch {
      setError(t("workspaces.inviteUnavailable", "Invitation unavailable."));
      setBusy(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    if (!token.current || started.current) return;
    started.current = true;
    window.history.replaceState(window.history.state, "", "/app/workspaces/invite");
    void redeem({ token: token.current });
  }, [redeem]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void redeem({ code });
  };

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">{t("workspaces.joinWorkspace", "Join workspace")}</h1>
        <form className="mt-4 grid gap-3" onSubmit={submit}>
          <Label htmlFor="workspace-join-code">{t("workspaces.joinCode", "Join code")}</Label>
          <Input id="workspace-join-code" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
          <Button type="submit" disabled={busy || !code.trim()}>{busy ? t("workspaces.joining", "Joining...") : t("workspaces.join", "Join")}</Button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
