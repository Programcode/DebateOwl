// src/App.tsx
import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider, useAuth } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AccountQueryCache } from "@/components/auth/AccountQueryCache";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSessionStorageSync } from "@/hooks/use-session-storage-sync";
import { useOnboardingStore } from "@/hooks/use-onboarding";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { StagingBanner } from "@/components/StagingBanner";
import { captureException, captureProductEvent, toTelemetrySafeError } from "@/lib/observability";
import { routeLoaders } from "@/lib/route-modules";
import { RouteSkeleton, type RouteSkeletonVariant } from "@/components/loading/RouteSkeleton";
import { useTranslation } from "react-i18next";
import { COLLABORATION_URL } from "@/lib/workspace/collaboration-config";

// Lazy load all pages for code splitting
const LandingPage = lazy(routeLoaders["/"]);
const TermsPage = lazy(routeLoaders["/terms"]);
const PrivacyPage = lazy(routeLoaders["/privacy"]);
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
const SourcesPage = lazy(routeLoaders["/expocit/sources"]);
const NotFound = lazy(routeLoaders["*"]);
const OnboardingTour = lazy(() => import("@/components/features/onboarding/OnboardingTour")
  .then(({ OnboardingTour: Tour }) => ({ default: Tour })));

const queryClient = new QueryClient();

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

function RouteContent({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { t } = useTranslation();
  const fallback = getRouteFallback(location.pathname);
  const label = fallback.labelKey ? t(fallback.labelKey, fallback.label) : fallback.label;
  const statusText = t("common.openingPage", { page: label });

  return (
    <LocalizedRouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteSkeleton variant={fallback.variant} label={label} statusText={statusText} />}>
        {children}
      </Suspense>
    </LocalizedRouteErrorBoundary>
  );
}

function OptionalOnboardingTour() {
  const location = useLocation();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const isTourRunning = useOnboardingStore((state) => state.isTourRunning);
  const shouldLoadTour = isTourRunning || (location.pathname === "/app" && !hasCompletedOnboarding);

  if (!shouldLoadTour) return null;

  return <TimedOnboardingTour />;
}

function TimedOnboardingTour() {
  const [eligibleAt] = useState(() => typeof performance === "undefined" ? 0 : performance.now());

  return (
    <Suspense fallback={null}>
      <OnboardingTour eligibleAt={eligibleAt} />
    </Suspense>
  );
}

function AppRoutes() {
  useSessionStorageSync();

  return (
    <Routes>
          {/* Public Routes */}
          <Route path="/" element={<RouteContent><LandingPage /></RouteContent>} />
          <Route path="/terms" element={<RouteContent><TermsPage /></RouteContent>} />
          <Route path="/privacy" element={<RouteContent><PrivacyPage /></RouteContent>} />
          <Route path="/expocit/sources" element={<RouteContent><SourcesPage /></RouteContent>} />
          <Route path="/login" element={<RouteContent><LoginPage /></RouteContent>} />
          <Route path="/share/:code" element={<RouteContent><SharedPage /></RouteContent>} />

          {/* Protected App Routes */}
          <Route
            element={
              <RequireAuth>
                <ToolRouteAnalytics />
                <OptionalOnboardingTour />
                <AppLayout />
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
