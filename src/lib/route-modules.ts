import { loadAllAppLanguages } from "@/i18n";

export type RouteLoader<T> = (() => Promise<T>) & {
  /** The module once it has loaded, so a page can render without suspending. */
  loaded: () => T | undefined;
};

function cacheLoader<T>(loader: () => Promise<T>): RouteLoader<T> {
  let pending: Promise<T> | undefined;
  let loaded: T | undefined;

  const load = () => {
    if (pending) return pending;

    pending = loader().then((module) => {
      loaded = module;
      return module;
    }, (error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  return Object.assign(load, { loaded: () => loaded });
}

export const routeLoaders = {
  "/": cacheLoader(() => import("@/pages/LandingPage")),
  "/terms": cacheLoader(() => import("@/pages/TermsPage")),
  "/privacy": cacheLoader(() => import("@/pages/PrivacyPage")),
  "/expocit/sources": cacheLoader(() => import("@/pages/SourcesPage")),
  "/login": cacheLoader(() => import("@/pages/LoginPage")),
  "/auth/callback": cacheLoader(() => import("@/pages/AuthCallbackPage")),
  "/share/:code": cacheLoader(() => import("@/pages/SharedPage")),
  "/app": cacheLoader(() => import("@/pages/HomePage")),
  "/app/debate": cacheLoader(() => import("@/pages/CurrentDebatePage")),
  "/app/workspaces": cacheLoader(() => import("@/pages/WorkspacesPage")),
  "/app/workspaces/invite": cacheLoader(() => import("@/pages/WorkspaceInvitePage")),
  "/app/workspaces/:workspaceId": cacheLoader(() => import("@/pages/WorkspacePage")),
  "/app/generate": cacheLoader(() => import("@/pages/GeneratePage")),
  "/app/attack": cacheLoader(() => import("@/pages/AttackPage")),
  "/app/brainstorm": cacheLoader(() => import("@/pages/BrainstormPage")),
  "/app/factoids": cacheLoader(() => import("@/pages/FactoidsPage")),
  "/app/ask": cacheLoader(() => import("@/pages/AskPage")),
  "/app/crossfire": cacheLoader(() => import("@/pages/CrossfirePage")),
  "/app/history": cacheLoader(() => import("@/pages/HistoryPage")),
  "/app/library": cacheLoader(() => import("@/pages/LibraryPage")),
  "/app/timer": cacheLoader(() => import("@/pages/TimerPage")),
  "/app/sparring": cacheLoader(() => import("@/pages/SparringPage")),
  // Charts saved before nodes kept their text keys hold starter text in the
  // language they were made in; recognising it needs every catalog.
  "/app/flowchart": cacheLoader(() => Promise.all([import("@/pages/FlowchartPage"), loadAllAppLanguages()]).then(([page]) => page)),
  "/app/settings": cacheLoader(() => import("@/pages/SettingsPage")),
  "/app/admin": cacheLoader(() => import("@/pages/AdminPage")),
  "/tools": cacheLoader(() => import("@/pages/tools/ToolsHubPage")),
  "/tools/debate-timer": cacheLoader(() => import("@/pages/tools/DebateTimerToolPage")),
  "/tools/debate-motion-generator": cacheLoader(() => import("@/pages/tools/MotionGeneratorToolPage")),
  "/tools/debate-flow-sheet": cacheLoader(() => import("@/pages/tools/FlowSheetToolPage")),
  "/tools/speech-time-calculator": cacheLoader(() => import("@/pages/tools/SpeechTimeCalculatorToolPage")),
  "*": cacheLoader(() => import("@/pages/NotFound")),
} as const;

/** The signed-in header and navigation around every /app page. */
export const appLayoutLoader = cacheLoader(() => import("@/components/layout/AppLayout")
  .then(({ AppLayout }) => ({ default: AppLayout })));

type RoutePath = keyof typeof routeLoaders;

function isRoutePath(pathname: string): pathname is RoutePath {
  return Object.prototype.hasOwnProperty.call(routeLoaders, pathname);
}

export function preloadRoute(pathname: string): Promise<unknown> | undefined {
  return isRoutePath(pathname) ? routeLoaders[pathname]() : undefined;
}

/**
 * Starts fetching the page being opened (and the signed-in layout under /app)
 * while the entry is still starting up, instead of when React first reaches it.
 */
export function preloadStartupRoute(pathname: string): Promise<unknown> | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/app" || normalized.startsWith("/app/")) void appLayoutLoader().catch((): void => undefined);
  const page = preloadRoute(normalized);
  // A failed load is reported by the route's own lazy load when it renders.
  page?.catch((): void => undefined);
  return page;
}
