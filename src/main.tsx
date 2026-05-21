import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { preloadOfflineRoutes } from "./offline-route-preload";
import { registerServiceWorker } from "./register-service-worker";

createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
preloadOfflineRoutes();
