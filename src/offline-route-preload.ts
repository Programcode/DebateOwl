const preloaders = [
  () => import('./pages/HomePage'),
  () => import('./pages/GeneratePage'),
  () => import('./pages/AttackPage'),
  () => import('./pages/BrainstormPage'),
  () => import('./pages/FactoidsPage'),
  () => import('./pages/AskPage'),
  () => import('./pages/HistoryPage'),
  () => import('./pages/LibraryPage'),
  () => import('./pages/TimerPage'),
  () => import('./pages/FlowchartPage'),
  () => import('./pages/SettingsPage'),
  () => import('./pages/AdminPage'),
  () => import('./pages/SourcesPage'),
  () => import('./pages/TermsPage'),
  () => import('./pages/PrivacyPage'),
];

export function preloadOfflineRoutes() {
  if (!import.meta.env.PROD) return;

  const run = () => {
    void Promise.allSettled(preloaders.map((load) => load()));
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 8000 });
    return;
  }

  window.setTimeout(run, 2500);
}
