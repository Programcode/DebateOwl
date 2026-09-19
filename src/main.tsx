import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { WebTelemetry } from "./components/WebTelemetry";
import "./i18n";
import "./index.css";
import { registerNativeAppUrlListener } from "./native-app-url-listener";
import { configureNativeRuntime } from "./native-runtime";
import { registerServiceWorker } from "./register-service-worker";
import { initializeObservability } from "./lib/observability";
import { isNativeApp } from "./lib/native";

const initializeTelemetry = (): void => {
  const run = (): void => { void initializeObservability(); };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run);
  } else {
    window.setTimeout(run, 0);
  }
};

export function mountApp(): void {
  createRoot(document.getElementById("root")!).render(
    <>
      <App />
      {!isNativeApp() && (
        <WebTelemetry />
      )}
    </>,
  );
  configureNativeRuntime();
  registerNativeAppUrlListener();
  registerServiceWorker();

  if (document.readyState === "complete") {
    initializeTelemetry();
  } else {
    window.addEventListener("load", initializeTelemetry, { once: true });
  }
}
