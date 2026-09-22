import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { listWorkspaces } from "@/lib/workspace/client";
import { useAuth } from "@/lib/supabase/AuthProvider";

export default function WorkspacesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [motion, setMotion] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived" | "all">("active");
  const requestId = useRef<string | null>(null);
  const workspaces = useQuery({ queryKey: ["workspaces", user?.id], queryFn: listWorkspaces, enabled: Boolean(user) });
  const visibleWorkspaces = workspaces.data?.filter((workspace) => view === "all" || workspace.status === view);

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedMotion = motion.trim();
    if (!normalizedMotion || creating) return;

    setCreating(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    const language = ["en", "es", "hu"].includes(i18n.language)
      ? i18n.language
      : "en";
    const { data, error: createError } = await supabase.rpc("create_workspace", {
      p_language: language,
      p_motion: normalizedMotion,
      p_request_id: requestId.current,
      p_title: null,
    });

    if (createError || typeof data !== "string") {
      setError(t("workspaces.createFailed", "Workspace creation failed. Try again."));
      setCreating(false);
      return;
    }

    requestId.current = null;
    navigate(`/app/workspaces/${data}`);
  };

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto min-h-[72vh] max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("workspaces.title", "Workspaces")}
        </h1>
        <Card className="mt-6 border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle>{t("workspaces.new", "New workspace")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createWorkspace}>
            <div className="space-y-2">
              <Label htmlFor="workspace-motion">{t("workspaces.motion", "Motion")}</Label>
              <Textarea
                id="workspace-motion"
                value={motion}
                onChange={(event) => {
                  setMotion(event.target.value);
                  requestId.current = null;
                }}
                placeholder={t("workspaces.motionPlaceholder", "Schools should ban phones")}
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={!motion.trim() || creating}>
              {creating
                ? t("workspaces.creating", "Creating...")
                : t("workspaces.create", "Create workspace")}
            </Button>
            </form>
          </CardContent>
        </Card>

        <section className="mt-8" aria-labelledby="workspace-list-title">
          <h2 id="workspace-list-title" className="text-xl font-semibold tracking-tight">
            {t("workspaces.yours", "Your workspaces")}
          </h2>
          <div className="mt-3 flex gap-1" aria-label={t("workspaces.workspaceView", "Workspace view")}>
            {(["active", "archived", "all"] as const).map((option) => (
              <Button key={option} type="button" size="sm" variant={view === option ? "secondary" : "ghost"} onClick={() => setView(option)}>
                {t(`workspaces.${option}`, option)}
              </Button>
            ))}
          </div>
          {workspaces.isLoading && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {t("workspaces.loading", "Loading workspaces...")}
            </p>
          )}
          {workspaces.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("workspaces.loadFailed", "Workspaces could not be loaded.")}
            </p>
          )}
          {visibleWorkspaces?.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("workspaces.empty", "Create your first workspace above.")}
            </p>
          )}
          <div className="mt-3 grid gap-3">
            {visibleWorkspaces?.map((workspace) => (
              <Link
                key={workspace.id}
                to={`/app/workspaces/${workspace.id}`}
                className="motion-press flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-4 hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {workspace.title ?? workspace.motion}
                  </span>
                  {workspace.title && (
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {workspace.motion}
                    </span>
                  )}
                </span>
                <Badge variant={workspace.status === "active" ? "secondary" : "outline"}>
                  {t(`workspaces.${workspace.status}`, workspace.status)}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
