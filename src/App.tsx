// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import GeneratePage from "./pages/GeneratePage";
import AttackPage from "./pages/AttackPage";
import BrainstormPage from "./pages/BrainstormPage";
import FactoidsPage from "./pages/FactoidsPage";
import AskPage from "./pages/AskPage";
import SettingsPage from "./pages/SettingsPage";
import HistoryPage from "./pages/HistoryPage";
import LibraryPage from "./pages/LibraryPage";
import TimerPage from "./pages/TimerPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<GeneratePage />} />
            <Route path="/attack" element={<AttackPage />} />
            <Route path="/brainstorm" element={<BrainstormPage />} />
            <Route path="/factoids" element={<FactoidsPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
