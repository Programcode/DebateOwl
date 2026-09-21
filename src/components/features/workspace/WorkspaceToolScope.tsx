import { useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { attachWorkspaceResult, parseWorkspaceToolContext, type WorkspaceTool } from "@/lib/workspace/tool-context";

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceToolScope(tool: WorkspaceTool) {
  const location = useLocation();
  const context = useMemo(
    () => parseWorkspaceToolContext((location.state as { workspaceContext?: unknown } | null)?.workspaceContext),
    [location.state],
  );
  const attach = useCallback(
    (input: unknown, output: unknown) => attachWorkspaceResult(context, tool, input, output),
    [context, tool],
  );
  return { attach, context };
}

export function WorkspaceToolScope({ context }: { context: ReturnType<typeof parseWorkspaceToolContext> }) {
  const { t } = useTranslation();
  if (!context) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <span>{t("workspaces.sharedToolScope", "Shared workspace session · {{document}}", { document: context.documentTitle })}</span>
      <Link className="font-medium text-primary underline-offset-4 hover:underline" to={context.returnUrl}>
        {t("workspaces.returnToWorkspace", "Return to workspace")}
      </Link>
    </div>
  );
}
