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

const PRODUCT_PROPERTY_KEYS = new Set([
  "durationMs",
  "errorName",
  "feature",
  "format",
  "model",
  "provider",
  "roundIndex",
  "speechCount",
  "statusCode",
  "streaming",
  "tool",
  "winner",
]);

type TelemetryAttribute = string | number | boolean;

function safeProductProperties(properties?: Record<string, unknown>): Record<string, TelemetryAttribute> {
  if (!properties) return {};

  const safeProperties: Record<string, TelemetryAttribute> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!PRODUCT_PROPERTY_KEYS.has(key)) continue;
    if (typeof value === "string" || typeof value === "boolean") safeProperties[key] = value;
    if (typeof value === "number" && Number.isFinite(value)) safeProperties[key] = value;
  }
  return safeProperties;
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
      beforeBreadcrumb: filterObservabilityBreadcrumb,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        queryParams: false,
        genAI: { inputs: false, outputs: false },
        stackFrameVariables: false,
        frameContextLines: 5,
      },
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ],
      enableLogs: true,
      enableMetrics: true,
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
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
  const safeProperties = safeProductProperties(properties);

  if (import.meta.env.VITE_POSTHOG_KEY) {
    try {
      posthog.capture(name, safeProperties);
    } catch {
      // Telemetry must not interrupt product behavior.
    }
  }

  if (import.meta.env.VITE_SENTRY_DSN) {
    const attributes = { event_name: name, ...safeProperties };
    try {
      Sentry.logger.info("Product event", attributes);
      Sentry.metrics.count("debatelab.product_event", 1, { attributes });
      if (typeof safeProperties.durationMs === "number") {
        Sentry.metrics.distribution("debatelab.product_event.duration", safeProperties.durationMs, {
          unit: "millisecond",
          attributes,
        });
      }
    } catch {
      // Telemetry must not interrupt product behavior.
    }
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
