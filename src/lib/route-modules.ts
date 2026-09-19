export const routeLoaders = {
  "/": () => import("@/pages/LandingPage"),
  "/terms": () => import("@/pages/TermsPage"),
  "/privacy": () => import("@/pages/PrivacyPage"),
  "/expocit/sources": () => import("@/pages/SourcesPage"),
  "/login": () => import("@/pages/LoginPage"),
  "/share/:code": () => import("@/pages/SharedPage"),
  "/app": () => import("@/pages/HomePage"),
  "/app/generate": () => import("@/pages/GeneratePage"),
  "/app/attack": () => import("@/pages/AttackPage"),
  "/app/brainstorm": () => import("@/pages/BrainstormPage"),
  "/app/factoids": () => import("@/pages/FactoidsPage"),
  "/app/ask": () => import("@/pages/AskPage"),
  "/app/crossfire": () => import("@/pages/CrossfirePage"),
  "/app/history": () => import("@/pages/HistoryPage"),
  "/app/library": () => import("@/pages/LibraryPage"),
  "/app/timer": () => import("@/pages/TimerPage"),
  "/app/sparring": () => import("@/pages/SparringPage"),
  "/app/flowchart": () => import("@/pages/FlowchartPage"),
  "/app/settings": () => import("@/pages/SettingsPage"),
  "/app/admin": () => import("@/pages/AdminPage"),
  "*": () => import("@/pages/NotFound"),
} as const;

const pending = new Map<string, Promise<unknown>>();

export function preloadRoute(pathname: string): Promise<unknown> | undefined {
  const loader = routeLoaders[pathname as keyof typeof routeLoaders];
  if (!loader) return undefined;

  const existing = pending.get(pathname);
  if (existing) return existing;

  const request = loader().catch((error) => {
    pending.delete(pathname);
    throw error;
  });
  pending.set(pathname, request);
  return request;
}
