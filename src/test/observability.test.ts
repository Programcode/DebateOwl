import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, posthogInitMock, sentryCaptureMock, sentryInitMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  posthogInitMock: vi.fn(),
  sentryCaptureMock: vi.fn(),
  sentryInitMock: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  captureException: sentryCaptureMock,
  init: sentryInitMock,
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

  it("does not capture product events when PostHog is not configured", () => {
    captureProductEvent("tool_opened", { tool: "generate" });

    expect(captureMock).not.toHaveBeenCalled();
  });

  it("passes structured product events through when PostHog is configured", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    const properties = {
      tool: "generate",
      format: "bp",
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

  it("initializes both SDKs once with privacy-preserving options", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "posthog-test-key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.example");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public-test@sentry.example/1");

    initializeObservability();
    initializeObservability();

    expect(sentryInitMock).toHaveBeenCalledOnce();
    expect(sentryInitMock).toHaveBeenCalledWith(expect.objectContaining({
      dsn: "https://public-test@sentry.example/1",
      sendDefaultPii: false,
    }));
    expect(posthogInitMock).toHaveBeenCalledOnce();
    expect(posthogInitMock).toHaveBeenCalledWith("posthog-test-key", expect.objectContaining({
      api_host: "https://posthog.example",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      persistence: "memory",
    }));
  });
});
