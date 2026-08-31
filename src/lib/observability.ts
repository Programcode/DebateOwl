import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

let initialized = false;

interface ConsoleBreadcrumb {
  category?: string;
  level?: string;
  message?: string;
  data?: { arguments?: unknown };
}

/** Drops React's caught-render console entry without suppressing unrelated errors. */
export function filterObservabilityBreadcrumb<T extends ConsoleBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category !== "console" || breadcrumb.level !== "error") return breadcrumb;
  const args = Array.isArray(breadcrumb.data?.arguments) ? breadcrumb.data.arguments : [];
  const text = [breadcrumb.message, ...args]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const isReactCaughtRenderError = text.includes("The above error occurred in the <")
    || text.includes("React will try to recreate this component tree from scratch using the error boundary");
  return isReactCaughtRenderError ? null : breadcrumb;
}

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
      beforeBreadcrumb: filterObservabilityBreadcrumb,
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
  if (!import.meta.env.VITE_POSTHOG_KEY) return;

  try {
    posthog.capture(name, properties);
  } catch {
    // Telemetry must not interrupt product behavior.
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  try {
    Sentry.captureException(error, { extra: context });
  } catch {
    // Telemetry must not interrupt product behavior.
  }
}
