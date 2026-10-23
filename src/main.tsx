import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App.tsx";
import { WebTelemetry } from "./components/WebTelemetry";
import { appLanguageReady } from "./i18n";
import "@fontsource-variable/inter";
import "./index.css";
import { registerServiceWorker } from "./register-service-worker";
import { installStaleChunkReload } from "./lib/reload-stale-chunk";
import { initializeObservability } from "./lib/observability";
import { preloadStartupRoute } from "./lib/route-modules";
import { legacyCallbackPath } from "./lib/auth-callback";

const initializeTelemetry = (): void => {
  const run = (): void => { void initializeObservability(); };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run);
  } else {
    window.setTimeout(run, 0);
  }
};

const LANGUAGE_WAIT_MS = 3_000;

/** The route whose HTML the build prerendered into #root, when it is the page being opened. */
function prerenderedRoute(container: HTMLElement): string | undefined {
  const route = container.dataset.prerendered;
  return route === "*" || route === window.location.pathname ? route : undefined;
}

installStaleChunkReload();

export function mountApp(): void {
  // Sign-in links already in inboxes return to / or /app. Move them onto the
  // callback route before the first render, so the prerendered landing page
  // is replaced and AuthProvider exchanges the code there.
  const callbackPath = legacyCallbackPath(window.location);
  if (callbackPath) window.history.replaceState(window.history.state, "", callbackPath);

  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const app = (
    <>
      <App />
      <WebTelemetry />
    </>
  );
  const prerendered = prerenderedRoute(container);
  const page = preloadStartupRoute(prerendered === "*" ? "*" : window.location.pathname);
  // The first render waits for the chosen language's strings, so a Spanish or
  // Hungarian visitor never sees the English text first. A stalled request
  // must not hold the startup screen: after a few seconds English renders and
  // the language switches when its strings arrive.
  const languageReady = Promise.race([
    appLanguageReady(),
    new Promise<void>((resolve) => { window.setTimeout(resolve, LANGUAGE_WAIT_MS); }),
  ]);
  if (prerendered) {
    // The prerendered page stays on screen until its module is loaded, then one
    // synchronous render replaces it with the same page. A failed load renders
    // anyway and the route's own lazy load reports the error.
    const render = (): void => {
      flushSync(() => root.render(app));
      delete container.dataset.prerendered;
    };
    void Promise.all([page, languageReady]).then(render, render);
  } else {
    // HTML prerendered for another route (an offline copy, say) is replaced like the startup shell.
    delete container.dataset.prerendered;
    const render = (): void => root.render(app);
    void languageReady.then(render, render);
  }
  registerServiceWorker();

  if (document.readyState === "complete") {
    initializeTelemetry();
  } else {
    window.addEventListener("load", initializeTelemetry, { once: true });
  }
}
