// src/App.tsx
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OnboardingTour } from "@/components/features/onboarding/OnboardingTour";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSessionStorageSync } from "@/hooks/use-session-storage-sync";
import { Loader2 } from "lucide-react";

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
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const TimerPage = lazy(() => import("./pages/TimerPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const SharedPage = lazy(() => import("./pages/SharedPage"));
const FlowchartPage = lazy(() => import("./pages/FlowchartPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="motion-loading-shell flex min-h-[60vh] items-center justify-center">
    <div className="motion-loading-card flex flex-col items-center gap-4 rounded-lg border bg-card/80 px-8 py-7 shadow-lg">
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

function AnimatedRoutes() {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  useSessionStorageSync();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.998 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.998 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen motion-reduce:transform-none"
      >
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
            <Route path="/app/history" element={<HistoryPage />} />
            <Route path="/app/library" element={<LibraryPage />} />
            <Route path="/app/timer" element={<TimerPage />} />
            <Route path="/app/flowchart" element={<FlowchartPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<PageLoader />}>
              <AnimatedRoutes />
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
