import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { WebTelemetry } from "./components/WebTelemetry";
import "./i18n";
import "@fontsource-variable/inter";
import "./index.css";
import { registerServiceWorker } from "./register-service-worker";
import { initializeObservability } from "./lib/observability";

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
      <WebTelemetry />
    </>,
  );
  registerServiceWorker();

  if (document.readyState === "complete") {
    initializeTelemetry();
  } else {
    window.addEventListener("load", initializeTelemetry, { once: true });
  }
}
