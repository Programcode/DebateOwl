// src/App.tsx
import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OnboardingTour } from "@/components/features/onboarding/OnboardingTour";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSessionStorageSync } from "@/hooks/use-session-storage-sync";
import { Loader2 } from "lucide-react";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { captureException, captureProductEvent } from "@/lib/observability";
import { getRouteMotion, ROUTE_TRANSITION_DURATION_SECONDS } from "@/lib/motion-policy";

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

function AnimatedRoutes() {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const routeMotion = getRouteMotion(Boolean(shouldReduceMotion));
  useSessionStorageSync();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        {...routeMotion}
        data-reduced-motion={shouldReduceMotion ? "true" : "false"}
        data-route-transition-ms={ROUTE_TRANSITION_DURATION_SECONDS * 1000}
        className="min-h-screen motion-reduce:transform-none"
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/expocit/sources" element={<SourcesPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:code" element={<SharedPage />} />

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
            <Route path="/app" element={<HomePage />} />
            <Route path="/app/generate" element={<GeneratePage />} />
            <Route path="/app/attack" element={<AttackPage />} />
            <Route path="/app/brainstorm" element={<BrainstormPage />} />
            <Route path="/app/factoids" element={<FactoidsPage />} />
            <Route path="/app/ask" element={<AskPage />} />
            <Route path="/app/crossfire" element={<CrossfirePage />} />
            <Route path="/app/history" element={<HistoryPage />} />
            <Route path="/app/library" element={<LibraryPage />} />
            <Route path="/app/timer" element={<TimerPage />} />
            <Route path="/app/sparring" element={<SparringPage />} />
            <Route path="/app/flowchart" element={<FlowchartPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
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
                <AnimatedRoutes />
              </RouteErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
