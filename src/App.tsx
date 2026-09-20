// src/App.tsx
import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OnboardingTour } from "@/components/features/onboarding/OnboardingTour";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSessionStorageSync } from "@/hooks/use-session-storage-sync";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { captureException, captureProductEvent } from "@/lib/observability";
import { routeLoaders } from "@/lib/route-modules";
import { RouteSkeleton, type RouteSkeletonVariant } from "@/components/loading/RouteSkeleton";

// Lazy load all pages for code splitting
const LandingPage = lazy(routeLoaders["/"]);
const TermsPage = lazy(routeLoaders["/terms"]);
const PrivacyPage = lazy(routeLoaders["/privacy"]);
const HomePage = lazy(routeLoaders["/app"]);
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

type RouteFallback = {
  variant: RouteSkeletonVariant;
  label: string;
};

const DEFAULT_ROUTE_FALLBACK: RouteFallback = { variant: "public", label: "Page" };

const ROUTE_FALLBACKS: Record<string, RouteFallback> = {
  "/": { variant: "public", label: "DebateLab" },
  "/terms": { variant: "public", label: "Terms" },
  "/privacy": { variant: "public", label: "Privacy" },
  "/expocit/sources": { variant: "public", label: "Sources" },
  "/login": { variant: "public", label: "Sign in" },
  "/app": { variant: "home-grid", label: "Home" },
  "/app/generate": { variant: "tool-form", label: "Generate" },
  "/app/attack": { variant: "tool-form", label: "Attack" },
  "/app/brainstorm": { variant: "tool-form", label: "Brainstorm" },
  "/app/factoids": { variant: "tool-form", label: "Factoids" },
  "/app/crossfire": { variant: "tool-form", label: "Crossfire" },
  "/app/timer": { variant: "tool-form", label: "Timer" },
  "/app/flowchart": { variant: "tool-form", label: "Flowchart" },
  "/app/ask": { variant: "chat", label: "Ask" },
  "/app/sparring": { variant: "chat", label: "Sparring" },
  "/app/history": { variant: "settings/list", label: "History" },
  "/app/library": { variant: "settings/list", label: "Library" },
  "/app/settings": { variant: "settings/list", label: "Settings" },
  "/app/admin": { variant: "admin/table", label: "Admin" },
};

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function getRouteFallback(pathname: string): RouteFallback {
  const normalizedPathname = normalizePathname(pathname);
  if (normalizedPathname.startsWith("/share/")) return { variant: "public", label: "Shared debate" };
  return ROUTE_FALLBACKS[normalizedPathname] ?? DEFAULT_ROUTE_FALLBACK;
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    console.error('Route rendering failed');
    captureException(new Error("Route rendering failed"), { boundary: "route" });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Unable to load this page</h1>
          <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
  const fallback = getRouteFallback(location.pathname);

  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteSkeleton {...fallback} />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
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
                <OnboardingTour />
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/app" element={<RouteContent><HomePage /></RouteContent>} />
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
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200}>
            <Toaster />
            <Sonner />
            <OfflineIndicator />
            <BrowserRouter useTransitions={false}>
              <RouteErrorBoundary>
                <AppRoutes />
              </RouteErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
