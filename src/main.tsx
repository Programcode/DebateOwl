import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { preloadOfflineRoutes } from "./offline-route-preload";
import { registerNativeAppUrlListener } from "./native-app-url-listener";
import { configureNativeRuntime } from "./native-runtime";
import { registerServiceWorker } from "./register-service-worker";
import { initializeObservability } from "./lib/observability";
import { isNativeApp } from "./lib/native";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {!isNativeApp() && (
      <>
        <Analytics />
        <SpeedInsights />
      </>
    )}
  </>,
);
configureNativeRuntime();
initializeObservability();
registerNativeAppUrlListener();
registerServiceWorker();
preloadOfflineRoutes();
