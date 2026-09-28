import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  browserTracingIntegrationMock,
  captureMock,
  posthogInitMock,
  replayIntegrationMock,
  sentryCaptureMock,
  sentryInitMock,
  sentryLoggerInfoMock,
  sentryMetricsCountMock,
  sentryMetricsDistributionMock,
} = vi.hoisted(() => ({
  browserTracingIntegrationMock: vi.fn(() => ({ name: "BrowserTracing" })),
  captureMock: vi.fn(),
  posthogInitMock: vi.fn(),
  replayIntegrationMock: vi.fn(() => ({ name: "Replay" })),
  sentryCaptureMock: vi.fn(),
  sentryInitMock: vi.fn(),
  sentryLoggerInfoMock: vi.fn(),
  sentryMetricsCountMock: vi.fn(),
  sentryMetricsDistributionMock: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  browserTracingIntegration: browserTracingIntegrationMock,
  captureException: sentryCaptureMock,
  init: sentryInitMock,
  logger: { info: sentryLoggerInfoMock },
  metrics: {
    count: sentryMetricsCountMock,
    distribution: sentryMetricsDistributionMock,
  },
  replayIntegration: replayIntegrationMock,
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: captureMock,
    init: posthogInitMock,
  },
}));

import {
  captureException,
  captureProductEvent,
  filterObservabilityBreadcrumb,
  initializeObservability,
  resetObservabilityForTests,
  toTelemetrySafeError,
} from "@/lib/observability";

describe("observability primitives", () => {
  beforeEach(() => {
    resetObservabilityForTests();
    vi.clearAllMocks();
    vi.stubEnv("VITE_POSTHOG_KEY", undefined);
    vi.stubEnv("VITE_POSTHOG_HOST", undefined);
    vi.stubEnv("VITE_SENTRY_DSN", undefined);
    vi.stubEnv("VITE_SENTRY_RELEASE", undefined);
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not capture product events when neither service is configured", () => {
    captureProductEvent("tool_opened", { tool: "generate" });

    expect(captureMock).not.toHaveBeenCalled();
    expect(sentryLoggerInfoMock).not.toHaveBeenCalled();
    expect(sentryMetricsCountMock).not.toHaveBeenCalled();
  });

  it("passes structured product events through when PostHog is configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    const properties = {
      tool: "generate",
      format: "pdf",
      durationMs: 123,
      streaming: false,
    };

    captureProductEvent("tool_opened", properties);

    await vi.waitFor(() => expect(captureMock).toHaveBeenCalledOnce());
    expect(captureMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("tool_opened", properties);
    expect(properties).not.toHaveProperty("motion");
    expect(properties).not.toHaveProperty("content");
    expect(properties).not.toHaveProperty("message");
  });

  it("does not let PostHog failures interrupt the product", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    captureMock.mockImplementationOnce(() => {
      throw new Error("synthetic PostHog failure");
    });

    expect(() => captureProductEvent("tool_opened", { tool: "generate" })).not.toThrow();
    await vi.waitFor(() => expect(captureMock).toHaveBeenCalledOnce());
  });

  it("sends safe product logs and metrics to Sentry while dropping unexpected properties", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    captureProductEvent("ai_request_succeeded", {
      durationMs: 234,
      feature: "ask",
      message: "private debate content",
      model: "openai/gpt-5.6-luna",
    });

    const attributes = {
      event_name: "ai_request_succeeded",
      durationMs: 234,
      feature: "ask",
      model: "openai/gpt-5.6-luna",
    };
    await vi.waitFor(() => expect(sentryLoggerInfoMock).toHaveBeenCalledOnce());
    expect(sentryLoggerInfoMock).toHaveBeenCalledWith("Product event", attributes);
    expect(sentryMetricsCountMock).toHaveBeenCalledWith("debatelab.product_event", 1, { attributes });
    expect(sentryMetricsDistributionMock).toHaveBeenCalledWith(
      "debatelab.product_event.duration",
      234,
      { unit: "millisecond", attributes },
    );
    expect(JSON.stringify([
      ...sentryLoggerInfoMock.mock.calls,
      ...sentryMetricsCountMock.mock.calls,
      ...sentryMetricsDistributionMock.mock.calls,
    ])).not.toContain("private debate content");
  });

  it("rejects private strings in allowlisted fields and rejects unknown event names", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    captureProductEvent("ai_request_succeeded", {
      feature: "private debate content",
      model: "student@example.com",
      provider: "openrouter",
    });
    captureProductEvent("student@example.com", { feature: "ask" });

    await vi.waitFor(() => expect(captureMock).toHaveBeenCalledOnce());
    expect(captureMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("ai_request_succeeded", { provider: "openrouter" });
    expect(sentryLoggerInfoMock).toHaveBeenCalledOnce();
    expect(sentryLoggerInfoMock).toHaveBeenCalledWith("Product event", {
      event_name: "ai_request_succeeded",
      provider: "openrouter",
    });
    expect(JSON.stringify([
      ...captureMock.mock.calls,
      ...sentryLoggerInfoMock.mock.calls,
      ...sentryMetricsCountMock.mock.calls,
    ])).not.toMatch(/private debate content|student@example\.com/);
  });

  it("does not send exceptions when Sentry is not configured", () => {
    captureException(new Error("synthetic test error"), { category: "test" });

    expect(sentryCaptureMock).not.toHaveBeenCalled();
  });

  it("passes exceptions and structured context through when Sentry is configured", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");
    const error = new Error("synthetic test error");
    const context = { provider: "openrouter", category: "provider_error" };

    captureException(error, context);

    await vi.waitFor(() => expect(sentryCaptureMock).toHaveBeenCalledOnce());
    expect(sentryCaptureMock).toHaveBeenCalledOnce();
    expect(sentryCaptureMock).toHaveBeenCalledWith(error, { extra: context });
  });

  it("does not let Sentry failures interrupt the product", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");
    sentryCaptureMock.mockImplementationOnce(() => {
      throw new Error("synthetic Sentry failure");
    });

    expect(() => captureException(new Error("synthetic test error"))).not.toThrow();
    await vi.waitFor(() => expect(sentryCaptureMock).toHaveBeenCalledOnce());
  });

  it("drops React error-boundary console breadcrumbs but preserves other console errors", () => {
    const reactBreadcrumb = {
      category: "console",
      level: "error",
      data: {
        arguments: [
          new Error("private descendant message"),
          "The above error occurred in the <PrivateRoute> component:\n    at PrivateRoute",
          "React will try to recreate this component tree from scratch using the error boundary you provided.",
        ],
      },
    };
    const ordinaryBreadcrumb = {
      category: "console",
      level: "error",
      data: { arguments: ["ordinary application error"] },
    };

    expect(filterObservabilityBreadcrumb(reactBreadcrumb)).toBeNull();
    expect(filterObservabilityBreadcrumb(ordinaryBreadcrumb)).toBe(ordinaryBreadcrumb);
  });

  it("initializes selected observability capabilities and privacy controls once", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.example");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    await initializeObservability();
    await initializeObservability();

    expect(sentryInitMock).toHaveBeenCalledOnce();
    expect(sentryInitMock).toHaveBeenCalledWith(expect.objectContaining({
      dsn: "https://public-test@sentry.example/1",
      ignoreErrors: [/^Synthetic observability verification$/],
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
      enableLogs: true,
      enableMetrics: true,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
    }));
    // Deprecated and ignored whenever dataCollection is set: passing it would
    // read as a PII control that does nothing.
    expect(sentryInitMock.mock.calls[0][0]).not.toHaveProperty("sendDefaultPii");
    expect(browserTracingIntegrationMock).toHaveBeenCalledOnce();
    expect(replayIntegrationMock).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    });
    expect(posthogInitMock).toHaveBeenCalledOnce();
    expect(posthogInitMock).toHaveBeenCalledWith("posthog-test-key", expect.objectContaining({
      api_host: "https://posthog.example",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      persistence: "memory",
    }));
  });

  it("tags Sentry events with the build release and deployment environment", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");
    vi.stubEnv("VITE_SENTRY_RELEASE", "abc123");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "preview");

    await initializeObservability();

    expect(sentryInitMock).toHaveBeenCalledWith(expect.objectContaining({
      release: "abc123",
      environment: "preview",
    }));
  });

  it("falls back to the build mode when no deployment environment is known", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    await initializeObservability();

    expect(sentryInitMock.mock.calls[0][0].release).toBeUndefined();
    expect(sentryInitMock.mock.calls[0][0].environment).toBe(import.meta.env.MODE);
  });

  it("keeps V8 stack frames but drops a multi-line private message", () => {
    const original = new TypeError("secret debate text\n    still secret");
    original.stack = [
      "TypeError: secret debate text",
      "    still secret",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
      "    at renderWithHooks (https://debate.example/assets/vendor.js:20:7)",
    ].join("\n");

    const safe = toTelemetrySafeError(original, "Route rendering failed");

    expect(safe.name).toBe("TypeError");
    expect(safe.message).toBe("Route rendering failed");
    expect(safe.stack).toBe([
      "TypeError: Route rendering failed",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
      "    at renderWithHooks (https://debate.example/assets/vendor.js:20:7)",
    ].join("\n"));
    expect(safe).not.toHaveProperty("cause");
  });

  it("drops message lines shaped like stack frames", () => {
    const original = new TypeError("my speech\n    at the rally 10:30:45\n  at secret (native)\nme@home.org:12:30\n    at leak (https://evil.example/a.js:1:2)");
    original.stack = [
      "TypeError: my speech",
      "    at the rally 10:30:45",
      "  at secret (native)",
      "me@home.org:12:30",
      "    at leak (https://evil.example/a.js:1:2)",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
    ].join("\n");

    expect(toTelemetrySafeError(original, "Route rendering failed").stack).toBe([
      "TypeError: Route rendering failed",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
    ].join("\n"));
  });

  it("drops frame-shaped text that is not a code location when the header is unknown", () => {
    const original = new Error("changed later");
    original.stack = [
      "    at the rally 10:30:45",
      "  at secret (native)",
      "me@home.org:12:30",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
    ].join("\n");

    expect(toTelemetrySafeError(original, "Route rendering failed").stack).toBe([
      "Error: Route rendering failed",
      "    at ExplodingRoute (https://debate.example/assets/index.js:10:5)",
    ].join("\n"));
  });

  it("keeps Firefox and Safari stack frames", () => {
    const original = new Error("secret");
    original.stack = [
      "ExplodingRoute@https://debate.example/assets/index.js:10:5",
      "@https://debate.example/assets/vendor.js:20:7",
    ].join("\n");

    expect(toTelemetrySafeError(original, "Route rendering failed").stack).toBe([
      "Error: Route rendering failed",
      "ExplodingRoute@https://debate.example/assets/index.js:10:5",
      "@https://debate.example/assets/vendor.js:20:7",
    ].join("\n"));
  });

  it("replaces custom or non-error names and ignores non-error values", () => {
    const named = new Error("secret");
    named.name = "secret user text";
    expect(toTelemetrySafeError(named, "Route rendering failed").name).toBe("Error");

    const safe = toTelemetrySafeError("secret thrown string", "Route rendering failed");
    expect(safe.name).toBe("Error");
    expect(safe.stack).toBe("Error: Route rendering failed");
  });
});
