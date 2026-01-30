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
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
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
              <Route path="/login" element={<LoginPage />} />
              <Route path="/share/:code" element={<SharedPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<GeneratePage />} />
                <Route path="/attack" element={<AttackPage />} />
                <Route path="/brainstorm" element={<BrainstormPage />} />
                <Route path="/factoids" element={<FactoidsPage />} />
                <Route path="/ask" element={<AskPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/timer" element={<TimerPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin" element={<AdminPage />} />
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
