import { AVAILABLE_MODELS, PROVIDER_ID } from "@/lib/ai/providers/types";

type SentryModule = typeof import("@sentry/react");
type PostHogClient = typeof import("posthog-js")["default"];

let sentryModulePromise: Promise<SentryModule | null> | null = null;
let posthogClientPromise: Promise<PostHogClient | null> | null = null;

export function resetObservabilityForTests(): void {
  if (import.meta.env.MODE !== "test") return;
  sentryModulePromise = null;
  posthogClientPromise = null;
}

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

/** Share links grant read access to whoever holds them; keep their codes out of telemetry. */
export function redactShareLinks<T extends { transaction?: string; request?: { url?: string } }>(event: T): T {
  const redact = (value: string) => value.replace(/\/share\/[^/?#\s]+/g, "/share/:code");
  if (event.transaction) event.transaction = redact(event.transaction);
  if (event.request?.url) event.request.url = redact(event.request.url);
  return event;
}

const SAFE_ERROR_NAME = /^[A-Z][A-Za-z]{0,40}Error$/;
const CODE_LOCATION = String.raw`(?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s()]+:\d+:\d+`;
const V8_STACK_FRAME = new RegExp(String.raw`^\s+at (?:.+ \(${CODE_LOCATION}\)|${CODE_LOCATION})$`);
const GECKO_STACK_FRAME = new RegExp(String.raw`^[^\s@]*@${CODE_LOCATION}$`);

/** Removes V8's leading `name: message` block, which can span several lines. */
function stackWithoutMessage(error: Error): string {
  const stack = error.stack ?? "";
  const header = String(error);
  if (stack.startsWith(header)) return stack.slice(header.length);
  const messageEnd = error.message ? stack.indexOf(error.message) : -1;
  return messageEnd === -1 ? stack : stack.slice(messageEnd + error.message.length);
}

/**
 * Keeps an error's type and code locations but replaces its message, which can
 * carry user-controlled text. The original message block is cut off, and only
 * lines that point at a URL or path survive. `cause` is dropped so linked-error
 * capture cannot reach the original message.
 */
export function toTelemetrySafeError(error: unknown, message: string): Error {
  const name = error instanceof Error && SAFE_ERROR_NAME.test(error.name) ? error.name : "Error";
  const frames = error instanceof Error
    ? stackWithoutMessage(error).split("\n").filter((line) => V8_STACK_FRAME.test(line) || GECKO_STACK_FRAME.test(line))
    : [];
  const safeError = new Error(message);
  safeError.name = name;
  safeError.stack = [`${name}: ${message}`, ...frames].join("\n");
  return safeError;
}

const PRODUCT_EVENT_NAMES = new Set([
  "ai_request_failed",
  "ai_request_started",
  "ai_request_succeeded",
  "content_exported",
  "sparring_round_completed",
  "sparring_session_judged",
  "tool_opened",
]);

const STRING_PROPERTY_VALUES: Record<string, ReadonlySet<string>> = {
  errorName: new Set([
    "AIAuthError",
    "AIModelRestrictionError",
    "AIProviderError",
    "AIRateLimitError",
    "AIResponseError",
    "AISubscriptionError",
    "Error",
    "TimeoutError",
    "TypeError",
    "UnknownError",
  ]),
  feature: new Set(["ask", "attack", "brainstorm", "crossfire", "factoids", "generate", "sparring"]),
  format: new Set(["docx", "google_docs", "ld", "pdf", "pf", "standard"]),
  model: new Set(AVAILABLE_MODELS.map((model) => model.id)),
  provider: new Set([PROVIDER_ID]),
  tool: new Set([
    "admin",
    "ask",
    "attack",
    "brainstorm",
    "crossfire",
    "factoids",
    "flowchart",
    "generate",
    "history",
    "library",
    "settings",
    "sparring",
    "timer",
  ]),
  winner: new Set(["ai", "tie", "user"]),
};

type TelemetryAttribute = string | number | boolean;

/** Retains only bounded values from the product telemetry schema. */
function safeProductProperties(properties?: Record<string, unknown>): Record<string, TelemetryAttribute> {
  if (!properties) return {};

  const safeProperties: Record<string, TelemetryAttribute> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && STRING_PROPERTY_VALUES[key]?.has(value)) safeProperties[key] = value;
    if (key === "streaming" && typeof value === "boolean") safeProperties[key] = value;
    if (key === "durationMs" && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3_600_000) {
      safeProperties[key] = value;
    }
    if ((key === "roundIndex" || key === "speechCount") && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100) {
      safeProperties[key] = Number(value);
    }
    if (key === "statusCode" && Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599) {
      safeProperties[key] = Number(value);
    }
  }
  return safeProperties;
}

async function loadSentry(): Promise<SentryModule | null> {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (!sentryDsn) return null;
  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/react").then((Sentry) => {
      Sentry.init({
      dsn: sentryDsn,
      release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
      ignoreErrors: [/^Synthetic observability verification$/],
      // No sendDefaultPii: deprecated, and Sentry ignores it whenever
      // dataCollection is set. The block below is the only PII control.
      beforeBreadcrumb: filterObservabilityBreadcrumb,
      beforeSend: redactShareLinks,
      beforeSendTransaction: redactShareLinks,
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
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      });
      return Sentry;
    }).catch((): null => null);
  }
  return sentryModulePromise;
}

async function loadPostHog(): Promise<PostHogClient | null> {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!posthogKey) return null;
  if (!posthogClientPromise) {
    posthogClientPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        persistence: "memory",
      });
      return posthog;
    }).catch((): null => null);
  }
  return posthogClientPromise;
}

/** Initializes configured observability SDKs once with explicit privacy controls. */
export async function initializeObservability(): Promise<void> {
  await Promise.all([loadSentry(), loadPostHog()]);
}

/** Reports a named product event only when its name and properties match the closed schema. */
export function captureProductEvent(name: string, properties?: Record<string, unknown>): void {
  if (!PRODUCT_EVENT_NAMES.has(name)) return;
  const safeProperties = safeProductProperties(properties);

  if (import.meta.env.VITE_POSTHOG_KEY) {
    void loadPostHog().then((posthog) => {
      try {
        posthog?.capture(name, safeProperties);
      } catch {
        // Telemetry must not interrupt product behavior.
      }
    });
  }

  if (import.meta.env.VITE_SENTRY_DSN) {
    const attributes = { event_name: name, ...safeProperties };
    void loadSentry().then((Sentry) => {
      try {
        Sentry?.logger.info("Product event", attributes);
        Sentry?.metrics.count("debatelab.product_event", 1, { attributes });
        if (Sentry && typeof safeProperties.durationMs === "number") {
          Sentry.metrics.distribution("debatelab.product_event.duration", safeProperties.durationMs, {
            unit: "millisecond",
            attributes,
          });
        }
      } catch {
        // Telemetry must not interrupt product behavior.
      }
    });
  }
}

/** Reports a safely constructed exception without allowing telemetry failures into product flows. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  void loadSentry().then((Sentry) => {
    try {
      Sentry?.captureException(error, { extra: context });
    } catch {
      // Telemetry must not interrupt product behavior.
    }
  });
}
