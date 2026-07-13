import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

let initialized = false;

export function initializeObservability(): void {
  if (initialized) return;
  initialized = true;

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      persistence: "memory",
    });
  }
}

export function captureProductEvent(name: string, properties?: Record<string, unknown>): void {
  if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture(name, properties);
  }
}
