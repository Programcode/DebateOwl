// src/App.tsx
import { Component, Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AccountQueryCache } from "@/components/auth/AccountQueryCache";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSessionStorageSync } from "@/hooks/use-session-storage-sync";
import { hasCompletedOnboarding, useOnboardingStore } from "@/hooks/use-onboarding";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { StagingBanner } from "@/components/StagingBanner";
import { captureException, captureProductEvent, toTelemetrySafeError } from "@/lib/observability";
import { appLayoutLoader, preloadStartupRoute, routeLoaders, type RouteLoader } from "@/lib/route-modules";
import type { PrerenderedRoute } from "@/lib/seo/pages";
import { usePrivateRouteHead } from "@/lib/seo/use-page-head";
import { RouteSkeleton, type RouteSkeletonVariant } from "@/components/loading/RouteSkeleton";
import { useTranslation } from "react-i18next";
import { COLLABORATION_URL } from "@/lib/workspace/collaboration-config";
import { AUTH_CALLBACK_PATH } from "@/lib/auth-callback";
import { chooseUrlLanguage, searchWithoutLanguage } from "@/lib/url-language";

/**
 * A page the build prerenders. mountApp loads its module before the first
 * render, so React replaces the prerendered HTML with the same page at once
 * instead of showing a route skeleton while the chunk resolves.
 */
function prerenderedPage(route: PrerenderedRoute) {
  const loader: RouteLoader<{ default: ComponentType }> = routeLoaders[route];
  const LazyPage = lazy(loader);
  return function PrerenderedPage() {
    const [Page] = useState(() => loader.loaded()?.default ?? LazyPage);
    return <Page />;
  };
}

// Lazy load all pages for code splitting
const LandingPage = prerenderedPage("/");
const TermsPage = prerenderedPage("/terms");
const PrivacyPage = prerenderedPage("/privacy");
const HomePage = lazy(routeLoaders["/app"]);
const CurrentDebatePage = lazy(routeLoaders["/app/debate"]);
const WorkspacesPage = lazy(routeLoaders["/app/workspaces"]);
const WorkspaceInvitePage = lazy(routeLoaders["/app/workspaces/invite"]);
const WorkspacePage = lazy(routeLoaders["/app/workspaces/:workspaceId"]);
const GeneratePage = lazy(routeLoaders["/app/generate"]);
const AttackPage = lazy(routeLoaders["/app/attack"]);
const BrainstormPage = lazy(routeLoaders["/app/brainstorm"]);
const FactoidsPage = lazy(routeLoaders["/app/factoids"]);
const AskPage = lazy(routeLoaders["/app/ask"]);
const CrossfirePage = lazy(routeLoaders["/app/crossfire"]);
const SettingsPage = lazy(routeLoaders["/app/settings"]);
const HistoryPage = lazy(routeLoaders["/app/history"]);
const LibraryPage = lazy(routeLoaders["/app/library"]);
const TimerPage = lazy(routeLoaders["/app/timer"]);
const SparringPage = lazy(routeLoaders["/app/sparring"]);
const AdminPage = lazy(routeLoaders["/app/admin"]);
const SharedPage = lazy(routeLoaders["/share/:code"]);
const FlowchartPage = lazy(routeLoaders["/app/flowchart"]);
const LoginPage = lazy(routeLoaders["/login"]);
const AuthCallbackPage = lazy(routeLoaders["/auth/callback"]);
const SourcesPage = lazy(routeLoaders["/expocit/sources"]);
const NotFound = prerenderedPage("*");
const ToolsHubPage = prerenderedPage("/tools");
const DebateTimerToolPage = prerenderedPage("/tools/debate-timer");
const MotionGeneratorToolPage = prerenderedPage("/tools/debate-motion-generator");
const FlowSheetToolPage = prerenderedPage("/tools/debate-flow-sheet");
const SpeechTimeCalculatorToolPage = prerenderedPage("/tools/speech-time-calculator");
// Public pages never load the signed-in header, navigation and debate dialogs.
// Arriving from sign-in, the page being opened loads alongside the layout
// instead of after it.
const AppLayout = lazy(() => {
  void preloadStartupRoute(window.location.pathname);
  return appLayoutLoader();
});
const OnboardingTour = lazy(() => import("@/components/features/onboarding/OnboardingTour")
  .then(({ OnboardingTour: Tour }) => ({ default: Tour })));

// TanStack Query refetches after an `offline` then `online` pair, but a page
// opened offline never sees `offline`. Retry whatever failed once the
// connection returns, such as Settings' admin-role check.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void queryClient.refetchQueries({ type: "active", predicate: (query) => query.state.status === "error" });
  });
}

type ToolName =
  | "generate"
  | "attack"
  | "brainstorm"
  | "factoids"
  | "ask"
  | "crossfire"
  | "history"
  | "library"
  | "timer"
  | "sparring"
  | "flowchart"
  | "settings";

const TOOL_BY_ROUTE = new Map<string, ToolName>([
  ["/app/generate", "generate"],
  ["/app/attack", "attack"],
  ["/app/brainstorm", "brainstorm"],
  ["/app/factoids", "factoids"],
  ["/app/ask", "ask"],
  ["/app/crossfire", "crossfire"],
  ["/app/history", "history"],
  ["/app/library", "library"],
  ["/app/timer", "timer"],
  ["/app/sparring", "sparring"],
  ["/app/flowchart", "flowchart"],
  ["/app/settings", "settings"],
]);

function getToolForPathname(pathname: string): ToolName | undefined {
  return TOOL_BY_ROUTE.get(normalizePathname(pathname));
}

export type RouteFallback = {
  variant: RouteSkeletonVariant;
  label: string;
  labelKey?: string;
};

const DEFAULT_ROUTE_FALLBACK: RouteFallback = { variant: "public", label: "Page", labelKey: "common.page" };

const ROUTE_FALLBACKS: Record<string, RouteFallback> = {
  "/": { variant: "public", label: "DebateLab" },
  "/terms": { variant: "public", label: "Terms", labelKey: "footer.terms" },
  "/privacy": { variant: "public", label: "Privacy", labelKey: "footer.privacy" },
  "/expocit/sources": { variant: "public", label: "Sources", labelKey: "crossfire.sources" },
  "/login": { variant: "public", label: "Sign in", labelKey: "login.title" },
  "/auth/callback": { variant: "public", label: "Sign in", labelKey: "login.title" },
  "/app": { variant: "home-grid", label: "Tools", labelKey: "nav.tools" },
  "/app/debate": { variant: "settings/list", label: "Current debate", labelKey: "nav.currentDebate" },
  "/app/workspaces": { variant: "settings/list", label: "Workspaces", labelKey: "nav.workspaces" },
  "/app/generate": { variant: "tool-form", label: "Generate", labelKey: "nav.generate" },
  "/app/attack": { variant: "tool-form", label: "Attack", labelKey: "nav.attack" },
  "/app/brainstorm": { variant: "tool-form", label: "Brainstorm", labelKey: "nav.brainstorm" },
  "/app/factoids": { variant: "tool-form", label: "Factoids", labelKey: "nav.factoids" },
  "/app/crossfire": { variant: "tool-form", label: "Crossfire", labelKey: "nav.crossfire" },
  "/app/timer": { variant: "tool-form", label: "Timer", labelKey: "nav.timer" },
  "/app/flowchart": { variant: "tool-form", label: "Flowchart", labelKey: "nav.flowchart" },
  "/app/ask": { variant: "chat", label: "Ask", labelKey: "nav.ask" },
  "/app/sparring": { variant: "chat", label: "Sparring", labelKey: "nav.sparring" },
  "/app/history": { variant: "settings/list", label: "History", labelKey: "nav.history" },
  "/app/library": { variant: "settings/list", label: "Library", labelKey: "nav.library" },
  "/app/settings": { variant: "settings/list", label: "Settings", labelKey: "nav.settings" },
  "/app/admin": { variant: "admin/table", label: "Admin", labelKey: "settings.admin" },
};

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getRouteFallback(pathname: string): RouteFallback {
  const normalizedPathname = normalizePathname(pathname);
  if (/^\/share\/[^/]+$/.test(normalizedPathname)) {
    return { variant: "public", label: "Shared debate", labelKey: "sharedPage.title" };
  }
  return ROUTE_FALLBACKS[normalizedPathname] ?? DEFAULT_ROUTE_FALLBACK;
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  heading?: string;
  reloadLabel?: string;
  homeLabel?: string;
  homeHref?: string;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Route rendering failed');
    captureException(toTelemetrySafeError(error, "Route rendering failed"), { boundary: "route" });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">{this.props.heading ?? 'Unable to load this page'}</h1>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>
              {this.props.reloadLabel ?? 'Reload'}
            </button>
            {/* A full navigation, so a broken route can't trap the user. */}
            <a href={this.props.homeHref ?? '/'} className="rounded-md border border-input px-4 py-2 text-foreground">
              {this.props.homeLabel ?? 'Go to Home'}
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LocalizedRouteErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <RouteErrorBoundary heading={t('routeError.heading')} reloadLabel={t('routeError.reload')} homeLabel={t('routeError.home')} homeHref={user ? '/app' : '/'}>
      {children}
    </RouteErrorBoundary>
  );
}

export function ToolRouteAnalytics(): null {
  const location = useLocation();

  useEffect(() => {
    const tool = getToolForPathname(location.pathname);
    if (tool) captureProductEvent("tool_opened", { tool });
  }, [location.pathname]);

  return null;
}

function useRouteLabel(pathname: string): { fallback: RouteFallback; label: string } {
  const { t } = useTranslation();
  const fallback = getRouteFallback(pathname);
  return { fallback, label: fallback.labelKey ? t(fallback.labelKey, fallback.label) : fallback.label };
}

/** The skeleton of the page being opened, shown while its session, layout or code loads. */
function PendingRoute() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { fallback, label } = useRouteLabel(pathname);
  return <RouteSkeleton variant={fallback.variant} label={label} statusText={t("common.openingPage", { page: label })} />;
}

/** The pending page before the signed-in layout exists, so it is the page's one <main>. */
function PendingAppRoute() {
  return (
    <main className="min-h-screen bg-background">
      <PendingRoute />
    </main>
  );
}

function RouteContent({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { label } = useRouteLabel(location.pathname);
  usePrivateRouteHead(location.pathname, label);

  return (
    <LocalizedRouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PendingRoute />}>
        {children}
      </Suspense>
    </LocalizedRouteErrorBoundary>
  );
}

function OptionalOnboardingTour() {
  const location = useLocation();
  const userId = useAuth().user?.id;
  const completed = useOnboardingStore((state) => hasCompletedOnboarding(state, userId));
  const isTourRunning = useOnboardingStore((state) => state.isTourRunning);
  const claimLegacyCompletion = useOnboardingStore((state) => state.claimLegacyCompletion);
  // A tour left running by the previous account never opens for one that finished it.
  const shouldLoadTour = !completed && (isTourRunning || location.pathname === "/app");

  useEffect(() => {
    if (userId) claimLegacyCompletion(userId);
  }, [claimLegacyCompletion, userId]);

  if (!userId || !shouldLoadTour) return null;

  // Keyed by account, so one account's half-finished tour never carries into the next.
  return <TimedOnboardingTour key={userId} userId={userId} />;
}

function TimedOnboardingTour({ userId }: { userId: string }) {
  const [eligibleAt] = useState(() => typeof performance === "undefined" ? 0 : performance.now());

  return (
    <Suspense fallback={null}>
      <OnboardingTour eligibleAt={eligibleAt} userId={userId} />
    </Suspense>
  );
}

/**
 * A new page starts at the top. Router links keep the window's scroll position, so a
 * footer link would open Terms at its bottom. Back and Forward (POP) keep the browser's
 * own restoration, and #anchor links scroll themselves.
 */
function ScrollToTopOnNavigate(): null {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef({ pathname, hash });
  useEffect(() => {
    // Only a new page: query-only updates (History's ?tab=) keep their place.
    const changed = previous.current.pathname !== pathname || previous.current.hash !== hash;
    previous.current = { pathname, hash };
    if (!changed || navigationType === "POP" || hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);
  return null;
}

/**
 * A ?lang= reached inside the app (the /es and /hu redirects): switch to it and
 * drop it from the address. mountApp handles the one a page opens with.
 */
export function UrlLanguage(): null {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (chooseUrlLanguage(search)) navigate({ pathname, search: searchWithoutLanguage(search), hash }, { replace: true });
  }, [hash, navigate, pathname, search]);
  return null;
}

function AppRoutes() {
  useSessionStorageSync();

  return (
    <Routes>
          {/* Public Routes */}
          <Route path="/" element={<RouteContent><LandingPage /></RouteContent>} />
          {/* Language home pages; vercel.json redirects them on a full load too. */}
          <Route path="/es" element={<Navigate to="/?lang=es" replace />} />
          <Route path="/hu" element={<Navigate to="/?lang=hu" replace />} />
          <Route path="/terms" element={<RouteContent><TermsPage /></RouteContent>} />
          <Route path="/privacy" element={<RouteContent><PrivacyPage /></RouteContent>} />
          <Route path="/expocit/sources" element={<RouteContent><SourcesPage /></RouteContent>} />
          <Route path="/login" element={<RouteContent><LoginPage /></RouteContent>} />
          <Route path={AUTH_CALLBACK_PATH} element={<RouteContent><AuthCallbackPage /></RouteContent>} />
          <Route path="/share/:code" element={<RouteContent><SharedPage /></RouteContent>} />
          <Route path="/tools" element={<RouteContent><ToolsHubPage /></RouteContent>} />
          <Route path="/tools/debate-timer" element={<RouteContent><DebateTimerToolPage /></RouteContent>} />
          <Route path="/tools/debate-motion-generator" element={<RouteContent><MotionGeneratorToolPage /></RouteContent>} />
          <Route path="/tools/debate-flow-sheet" element={<RouteContent><FlowSheetToolPage /></RouteContent>} />
          <Route path="/tools/speech-time-calculator" element={<RouteContent><SpeechTimeCalculatorToolPage /></RouteContent>} />

          {/* Protected App Routes */}
          <Route
            element={
              <RequireAuth fallback={<PendingAppRoute />}>
                <ToolRouteAnalytics />
                <OptionalOnboardingTour />
                <Suspense fallback={<PendingAppRoute />}>
                  <AppLayout />
                </Suspense>
              </RequireAuth>
            }
          >
            <Route path="/app" element={<RouteContent><HomePage /></RouteContent>} />
            <Route path="/app/debate" element={<RouteContent><CurrentDebatePage /></RouteContent>} />
            {COLLABORATION_URL && (
              <>
                <Route path="/app/workspaces" element={<RouteContent><WorkspacesPage /></RouteContent>} />
                <Route path="/app/workspaces/invite" element={<RouteContent><WorkspaceInvitePage /></RouteContent>} />
                <Route path="/app/workspaces/:workspaceId" element={<RouteContent><WorkspacePage /></RouteContent>} />
              </>
            )}
            <Route path="/app/generate" element={<RouteContent><GeneratePage /></RouteContent>} />
            <Route path="/app/attack" element={<RouteContent><AttackPage /></RouteContent>} />
            <Route path="/app/brainstorm" element={<RouteContent><BrainstormPage /></RouteContent>} />
            <Route path="/app/factoids" element={<RouteContent><FactoidsPage /></RouteContent>} />
            <Route path="/app/ask" element={<RouteContent><AskPage /></RouteContent>} />
            <Route path="/app/crossfire" element={<RouteContent><CrossfirePage /></RouteContent>} />
            <Route path="/app/history" element={<RouteContent><HistoryPage /></RouteContent>} />
            <Route path="/app/library" element={<RouteContent><LibraryPage /></RouteContent>} />
            <Route path="/app/timer" element={<RouteContent><TimerPage /></RouteContent>} />
            <Route path="/app/sparring" element={<RouteContent><SparringPage /></RouteContent>} />
            <Route path="/app/flowchart" element={<RouteContent><FlowchartPage /></RouteContent>} />
            <Route path="/app/settings" element={<RouteContent><SettingsPage /></RouteContent>} />
            {/* Billing lives in Settings (QB-12). */}
            <Route path="/app/billing" element={<Navigate to="/app/settings#subscription" replace />} />
            <Route path="/app/admin" element={<RouteContent><AdminPage /></RouteContent>} />
          </Route>
          <Route path="*" element={<RouteContent><NotFound /></RouteContent>} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AccountQueryCache />
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200}>
            <Toaster />
            <OfflineIndicator />
            <StagingBanner />
            <BrowserRouter useTransitions={false}>
              <ScrollToTopOnNavigate />
              <UrlLanguage />
              <LocalizedRouteErrorBoundary>
                <AppRoutes />
              </LocalizedRouteErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
