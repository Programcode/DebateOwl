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
import { Loader2 } from "lucide-react";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { captureException, captureProductEvent } from "@/lib/observability";

// Lazy load all pages for code splitting
const LandingPage = lazy(() => import("./pages/LandingPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const GeneratePage = lazy(() => import("./pages/GeneratePage"));
const AttackPage = lazy(() => import("./pages/AttackPage"));
const BrainstormPage = lazy(() => import("./pages/BrainstormPage"));
const FactoidsPage = lazy(() => import("./pages/FactoidsPage"));
const AskPage = lazy(() => import("./pages/AskPage"));
const CrossfirePage = lazy(() => import("./pages/CrossfirePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const TimerPage = lazy(() => import("./pages/TimerPage"));
const SparringPage = lazy(() => import("./pages/SparringPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const SharedPage = lazy(() => import("./pages/SharedPage"));
const FlowchartPage = lazy(() => import("./pages/FlowchartPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return TOOL_BY_ROUTE.get(normalizedPathname);
}

// Loading fallback component
const PageLoader = () => (
  <div className="motion-loading-shell flex min-h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card/80 px-8 py-7 shadow-lg">
      <div className="relative flex h-12 w-12 items-center justify-center">
        <span className="motion-ping-ring absolute h-full w-full rounded-full border border-primary/40" />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-muted">
        <div className="motion-loading-bar h-full rounded-full bg-primary" />
      </div>
    </div>
  </div>
);

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

  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoader />}>
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
            <BrowserRouter>
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
