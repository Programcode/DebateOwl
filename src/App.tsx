// src/App.tsx
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OnboardingTour } from "@/components/features/onboarding/OnboardingTour";
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
const LandingPage = lazy(() => import("./pages/LandingPage"));
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
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
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
                <Route path="/app" element={<GeneratePage />} />
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
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
