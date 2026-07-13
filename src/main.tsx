import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { preloadOfflineRoutes } from "./offline-route-preload";
import { registerNativeAppUrlListener } from "./native-app-url-listener";
import { configureNativeRuntime } from "./native-runtime";
import { registerServiceWorker } from "./register-service-worker";
import { initializeObservability } from "./lib/observability";

createRoot(document.getElementById("root")!).render(<App />);
configureNativeRuntime();
initializeObservability();
registerNativeAppUrlListener();
registerServiceWorker();
preloadOfflineRoutes();
