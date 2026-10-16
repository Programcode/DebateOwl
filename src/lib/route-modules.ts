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
  "/app/flowchart": cacheLoader(() => import("@/pages/FlowchartPage")),
  "/app/settings": cacheLoader(() => import("@/pages/SettingsPage")),
  "/app/admin": cacheLoader(() => import("@/pages/AdminPage")),
  "*": cacheLoader(() => import("@/pages/NotFound")),
} as const;

type RoutePath = keyof typeof routeLoaders;

function isRoutePath(pathname: string): pathname is RoutePath {
  return Object.prototype.hasOwnProperty.call(routeLoaders, pathname);
}

export function preloadRoute(pathname: string): Promise<unknown> | undefined {
  return isRoutePath(pathname) ? routeLoaders[pathname]() : undefined;
}
