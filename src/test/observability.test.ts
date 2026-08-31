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
} from "@/lib/observability";

describe("observability primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_POSTHOG_KEY", undefined);
    vi.stubEnv("VITE_POSTHOG_HOST", undefined);
    vi.stubEnv("VITE_SENTRY_DSN", undefined);
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

  it("passes structured product events through when PostHog is configured", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    const properties = {
      tool: "generate",
      format: "pdf",
      durationMs: 123,
      streaming: false,
    };

    captureProductEvent("tool_opened", properties);

    expect(captureMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("tool_opened", properties);
    expect(properties).not.toHaveProperty("motion");
    expect(properties).not.toHaveProperty("content");
    expect(properties).not.toHaveProperty("message");
  });

  it("does not let PostHog failures interrupt the product", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    captureMock.mockImplementationOnce(() => {
      throw new Error("synthetic PostHog failure");
    });

    expect(() => captureProductEvent("tool_opened", { tool: "generate" })).not.toThrow();
  });

  it("sends safe product logs and metrics to Sentry while dropping unexpected properties", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    captureProductEvent("ai_request_succeeded", {
      durationMs: 234,
      feature: "ask",
      message: "private debate content",
      model: "gpt-5.4-mini",
    });

    const attributes = {
      event_name: "ai_request_succeeded",
      durationMs: 234,
      feature: "ask",
      model: "gpt-5.4-mini",
    };
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

  it("rejects private strings in allowlisted fields and rejects unknown event names", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    captureProductEvent("ai_request_succeeded", {
      feature: "private debate content",
      model: "student@example.com",
      provider: "openai",
    });
    captureProductEvent("student@example.com", { feature: "ask" });

    expect(captureMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("ai_request_succeeded", { provider: "openai" });
    expect(sentryLoggerInfoMock).toHaveBeenCalledOnce();
    expect(sentryLoggerInfoMock).toHaveBeenCalledWith("Product event", {
      event_name: "ai_request_succeeded",
      provider: "openai",
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

  it("passes exceptions and structured context through when Sentry is configured", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");
    const error = new Error("synthetic test error");
    const context = { provider: "openai", category: "provider_error" };

    captureException(error, context);

    expect(sentryCaptureMock).toHaveBeenCalledOnce();
    expect(sentryCaptureMock).toHaveBeenCalledWith(error, { extra: context });
  });

  it("does not let Sentry failures interrupt the product", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");
    sentryCaptureMock.mockImplementationOnce(() => {
      throw new Error("synthetic Sentry failure");
    });

    expect(() => captureException(new Error("synthetic test error"))).not.toThrow();
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

  it("initializes selected observability capabilities and privacy controls once", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.example");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    initializeObservability();
    initializeObservability();

    expect(sentryInitMock).toHaveBeenCalledOnce();
    expect(sentryInitMock).toHaveBeenCalledWith(expect.objectContaining({
      dsn: "https://public-test@sentry.example/1",
      ignoreErrors: [/^Synthetic observability verification$/],
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
      enableLogs: true,
      enableMetrics: true,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
    }));
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
});
